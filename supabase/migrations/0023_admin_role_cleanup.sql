delete from public.user_roles as non_admin_role
using public.user_roles as admin_role
where non_admin_role.user_id = admin_role.user_id
  and admin_role.role = 'ADMIN'
  and non_admin_role.role <> 'ADMIN';
