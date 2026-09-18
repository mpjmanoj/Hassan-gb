-- Starting data for a real deployment.
--
-- Only what is actually known is here. Ward numbers, ward names and route geometry come
-- from the municipality — they are not invented, because a wrong ward list is worse than
-- an empty one. Add them through the dashboard, or fill in the template below.

insert into jurisdictions (name)
select 'Hassan City Municipal Council'
where not exists (select 1 from jurisdictions);

insert into areas (jurisdiction_id, name)
select j.id, 'Hassan City'
from jurisdictions j
where not exists (select 1 from areas where name = 'Hassan City');

-- Wards — replace with the real list before the pilot:
--
-- insert into wards (area_id, ward_number, name)
-- select a.id, v.number, v.name
-- from areas a,
--      (values (1, 'Ward 1 name'), (2, 'Ward 2 name')) as v(number, name)
-- where a.name = 'Hassan City';
--
-- Routes — one or more per ward. route_geometry can stay empty until the path is mapped;
-- assignments and tracking work without it, only the drawn route line is missing:
--
-- insert into routes (ward_id, route_name)
-- select w.id, 'Ward 1 Main Route' from wards w where w.ward_number = 1;
--
-- The first administrator: create the user in Authentication → Users, then
--
-- insert into admins (id, name, email, role)
-- values ('<that user id>', 'Your Name', 'you@example.gov.in', 'SUPER_ADMIN');
