import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, hasSupabase } from '../lib/supabaseClient.js';

const PROFILE_COLS = 'id, auth_user_id, role, full_name, phone, email, city, state, is_active';
const PARTNER_COLS = 'id, profile_id, partner_type, company_name, locality, section, verification_status';

const AuthContext = createContext(null);

async function ensureSupabaseProfile(user, role, formData) {
  const phone = `${formData.countryCode}${formData.phoneNumber}`;

  const { data: existingProfile, error: existingError } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (existingError) throw existingError;

  let profile = existingProfile;

  if (!profile) {
    const { data: inserted, error } = await supabase
      .from('profiles')
      .insert({
        auth_user_id: user.id,
        role,
        full_name: formData.fullName,
        phone,
        email: formData.email,
        city: formData.city || null,
        state: formData.state || null,
        is_active: true,
      })
      .select(PROFILE_COLS)
      .single();

    if (error) {
      throw new Error(`Signup auth user was created, but profile creation is blocked by Supabase RLS or schema rules. Original error: ${error.message}`);
    }

    profile = inserted;
  } else {
    const patch = {};
    if (profile.role !== role) patch.role = role;
    if (!profile.full_name && formData.fullName) patch.full_name = formData.fullName;
    if (!profile.phone && phone) patch.phone = phone;
    if (!profile.email && formData.email) patch.email = formData.email;
    if (!profile.city && formData.city) patch.city = formData.city;
    if (!profile.state && formData.state) patch.state = formData.state;
    if (profile.is_active === false) patch.is_active = true;

    if (Object.keys(patch).length) {
      const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', profile.id)
        .select(PROFILE_COLS)
        .single();
      if (updateError) throw updateError;
      profile = updated;
    }
  }

  if (role === 'partner') {
    const { data: existingPartner, error: partnerLookupError } = await supabase
      .from('partner_profiles')
      .select(PARTNER_COLS)
      .eq('profile_id', profile.id)
      .maybeSingle();

    if (partnerLookupError) throw partnerLookupError;

    if (!existingPartner) {
      const { error: partnerError } = await supabase.from('partner_profiles').insert({
        profile_id: profile.id,
        partner_type: formData.partnerType,
        company_name: formData.companyName || null,
        locality: formData.locality || null,
        section: formData.section || null,
        verification_status: 'pending_review',
      });

      if (partnerError) {
        throw new Error(`Partner profile creation failed: ${partnerError.message}`);
      }
    }
  }

  return profile;
}

async function recoverSupabaseProfile(user, expectedRole = null) {
  const meta = user.user_metadata || {};
  const targetRole = expectedRole || meta.role || 'user';

  let { data: profile, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) throw error;

  if (!profile) {
    const { data: created, error: createError } = await supabase
      .from('profiles')
      .insert({
        auth_user_id: user.id,
        role: targetRole,
        full_name: meta.full_name || user.email?.split('@')[0] || 'Denner User',
        phone: meta.phone || null,
        email: user.email || null,
        city: meta.city || null,
        state: meta.state || null,
        is_active: true,
      })
      .select(PROFILE_COLS)
      .single();

    if (createError) throw createError;
    profile = created;
  }

  if (targetRole === 'partner' && profile.role !== 'partner') {
    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update({ role: 'partner', is_active: true })
      .eq('id', profile.id)
      .select(PROFILE_COLS)
      .single();
    if (updateError) throw updateError;
    profile = updated;
  }

  if (targetRole === 'partner') {
    const { data: partnerProfile, error: partnerError } = await supabase
      .from('partner_profiles')
      .select(PARTNER_COLS)
      .eq('profile_id', profile.id)
      .maybeSingle();

    if (partnerError) throw partnerError;

    if (!partnerProfile) {
      await supabase.from('partner_profiles').insert({
        profile_id: profile.id,
        partner_type: meta.partner_type || 'owner',
        company_name: meta.company_name || null,
        locality: meta.locality || null,
        section: meta.section || null,
        verification_status: 'pending_review',
      });
    }

    const { data: mergedPartner } = await supabase
      .from('partner_profiles')
      .select('id, profile_id, partner_type, company_name, locality, section, verification_status')
      .eq('profile_id', profile.id)
      .maybeSingle();

    return {
      ...profile,
      partner_type: mergedPartner?.partner_type || null,
      company_name: mergedPartner?.company_name || null,
      locality: mergedPartner?.locality || profile.locality || null,
      section: mergedPartner?.section || null,
    };
  }

  return profile;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const syncCounter = useRef(0);

  const syncProfile = useCallback(async (nextSession, expectedRole = null) => {
    const syncId = ++syncCounter.current;
    setSession(nextSession || null);

    if (!nextSession?.user) {
      setProfile(null);
      setLoading(false);
      return null;
    }

    setLoading(false);
    try {
      const loadedProfile = await recoverSupabaseProfile(nextSession.user, expectedRole);
      if (syncCounter.current !== syncId) return null;
      setProfile(loadedProfile);
      return loadedProfile;
    } catch (syncError) {
      if (syncCounter.current !== syncId) return null;
      console.error('Profile sync failed', syncError);
      setProfile(null);
      return null;
    }
  }, []);

  const bootstrap = useCallback(async () => {
    if (!hasSupabase) {
      setSession(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      await syncProfile(currentSession);
    } catch (error) {
      console.error('Initial auth bootstrap failed', error);
      setSession(null);
      setProfile(null);
      setLoading(false);
    }
  }, [syncProfile]);

  useEffect(() => {
    bootstrap();

    if (!hasSupabase) return undefined;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      syncProfile(nextSession);
    });

    return () => subscription.unsubscribe();
  }, [bootstrap, syncProfile]);

  const signUp = useCallback(async ({ role, ...formData }) => {
    if (!hasSupabase) {
      throw new Error('Supabase is not configured for this app. No mock auth is enabled.');
    }

    const phone = `${formData.countryCode}${formData.phoneNumber}`;
    const signUpResult = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          role,
          partner_type: formData.partnerType || null,
          full_name: formData.fullName,
          phone,
          city: formData.city || null,
          state: formData.state || null,
          company_name: formData.companyName || null,
          locality: formData.locality || null,
          section: formData.section || null,
        },
      },
    });

    if (signUpResult.error) throw signUpResult.error;

    let authUser = signUpResult.data.user;
    let authSession = signUpResult.data.session;

    if (!authSession && formData.email && formData.password) {
      const loginResult = await supabase.auth.signInWithPassword({ email: formData.email, password: formData.password });
      if (loginResult.error) {
        throw new Error('Signup worked, but session could not be created. Turn off Confirm email for now in Supabase Email provider settings.');
      }
      authUser = loginResult.data.user;
      authSession = loginResult.data.session;
    }

    if (!authUser) throw new Error('Auth user was not created.');

    const createdProfile = await ensureSupabaseProfile(authUser, role, formData);
    const mergedProfile = role === 'partner' ? await recoverSupabaseProfile(authUser, 'partner') : createdProfile;
    setSession(authSession || { user: authUser });
    setProfile(mergedProfile);
    setLoading(false);
    return { user: authUser, profile: mergedProfile };
  }, []);

  const login = useCallback(async ({ email, password, expectedRole }) => {
    if (!hasSupabase) {
      throw new Error('Supabase is not configured for this app. No mock auth is enabled.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const loadedProfile = await recoverSupabaseProfile(data.user, expectedRole);
    if (loadedProfile.role !== expectedRole) {
      await supabase.auth.signOut({ scope: 'local' });
      setSession(null);
      setProfile(null);
      throw new Error('This account belongs to a different login type.');
    }

    setSession(data.session);
    setProfile(loadedProfile);
    setLoading(false);
    return { user: data.user, profile: loadedProfile };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!hasSupabase || !session?.user) {
      return null;
    }

    const nextProfile = await recoverSupabaseProfile(session.user);
    setProfile(nextProfile);
    return nextProfile;
  }, [session]);

  const logout = useCallback(async () => {
    syncCounter.current += 1;
    setSession(null);
    setProfile(null);
    setLoading(false);

    if (!hasSupabase) return;

    Promise.resolve().then(async () => {
      try {
        const { error } = await supabase.auth.signOut();
        if (error) {
          await supabase.auth.signOut({ scope: 'local' });
        }
      } catch {
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // ignore
        }
      }

      try {
        Object.keys(window.localStorage)
          .filter((key) => key.startsWith('sb-') || key.includes('supabase.auth'))
          .forEach((key) => window.localStorage.removeItem(key));
      } catch {
        // ignore
      }
    });
  }, []);

  const value = useMemo(() => ({
    session,
    profile,
    loading,
    isAuthenticated: Boolean(session?.user),
    signUp,
    login,
    logout,
    refreshProfile,
  }), [session, profile, loading, signUp, login, logout, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
