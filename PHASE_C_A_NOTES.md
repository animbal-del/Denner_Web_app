# Phase C-A Safe Save Property Build

Base used: v22

This build keeps the Phase B browsing foundation unchanged:
- properties page unchanged
- pagination unchanged
- filter UI unchanged
- public browsing provider unchanged

Phase C-A is added in a safer scope:
- save property button on property detail page only
- saved properties section on account page
- no save button added to listing cards yet
- no global saved-properties provider mounted in main app tree

Important:
- This zip intentionally excludes node_modules and package-lock.json
- Save-property service still attempts common table column variants for user_liked_properties
- Best expected schema remains profile_id + flat_id
