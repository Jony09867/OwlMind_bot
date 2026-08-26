update public.room_participants rp
set role = 'owner'
from public.rooms r
where rp.room_id = r.id
  and rp.user_id = r.owner_id
  and rp.role <> 'owner';
