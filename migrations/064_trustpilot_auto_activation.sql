-- Preserve previous approvals for review; newly approved requests explicitly opt in.
UPDATE trustpilot_rewards SET automation_state='manual_review'
WHERE status='approved' AND verified_at<'2026-11-03T07:24:17.920Z'
AND provider_reference IS NULL AND automation_started_at IS NULL;
