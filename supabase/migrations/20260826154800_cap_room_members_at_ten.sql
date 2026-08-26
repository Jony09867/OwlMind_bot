-- OwlMind room capacity: maximum 10 members per room.

alter table public.rooms alter column member_limit set default 10;

update public.rooms
set member_limit = least(member_limit, 10)
where member_limit > 10;

alter table public.rooms drop constraint if exists rooms_member_limit_check;
alter table public.rooms add constraint rooms_member_limit_check check (member_limit between 2 and 10);

create or replace function public.normalize_room_member_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.member_limit := least(10, greatest(2, coalesce(new.member_limit, 10)));
  return new;
end;
$$;

drop trigger if exists normalize_room_member_limit_trigger on public.rooms;
create trigger normalize_room_member_limit_trigger
before insert or update of member_limit on public.rooms
for each row execute function public.normalize_room_member_limit();
