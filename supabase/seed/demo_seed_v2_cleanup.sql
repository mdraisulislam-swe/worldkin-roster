-- =============================================================================
-- Worldkin Roster — Demo Seed v2 cleanup (owner-approved runs only)
-- -----------------------------------------------------------------------------
-- TARGET : worldkin-roster (ref ekkvwgohpzliwbmjnrth) ONLY. Operator session.
-- Retires the "(Demo v2)" records WITHOUT deleting history: shifts are
-- cancelled (which cancels their sign-ups and revokes pending offers), the
-- opportunities are closed, open applications are rejected with a reason,
-- the demo complaint is dismissed. Audit logs, participation records and
-- feedback are append-only by design and stay. Idempotent: safe to re-run.
-- Real (non-demo) data is never touched: every statement filters on
-- "(Demo v2)" titles or demo-only (@worldkin.test) accounts.
-- =============================================================================
do $cleanup$
declare
  r record;
begin
  -- Close the demo opportunities first so nothing new can attach to them.
  for r in select s.id from public.shifts s join public.opportunities o on o.id = s.opportunity_id
           where o.title like '%(Demo v2)' and s.status = 'scheduled' loop
    update public.shifts set status = 'cancelled', cancelled_reason = 'Demo data retired' where id = r.id;
    update public.signups set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Demo data retired'
     where shift_id = r.id and status in ('confirmed', 'waitlisted');
  end loop;
  update public.offers set status = 'revoked', responded_at = now()
   where status = 'pending'
     and application_id in (select a.id from public.applications a join public.opportunities o on o.id = a.opportunity_id
                            where o.title like '%(Demo v2)');
  update public.applications a set status = 'rejected', decision_reason = 'Demo data retired'
    from public.opportunities o
   where o.id = a.opportunity_id and o.title like '%(Demo v2)' and a.status in ('submitted', 'under_review', 'selected');
  update public.opportunities set status = 'closed'
   where title like '%(Demo v2)' and status <> 'closed';
  update public.complaints c set status = 'dismissed', admin_response = 'Demo data retired', handled_at = now()
    from public.profiles p join auth.users u on u.id = p.id
   where c.reporter_id = p.id and u.email like '%@worldkin.test' and c.subject like '%(Demo)' and c.status in ('open', 'in_review');
  raise notice 'DEMO_SEED_V2_RETIRED';
end;
$cleanup$;
