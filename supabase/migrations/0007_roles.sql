alter table perfiles add column rol text not null default 'empleado'
  check (rol in ('administrador', 'empleado'));

-- Promueve al único usuario existente del sistema a administrador.
-- Si para cuando corras esto ya hay más de un perfil creado, ajustá el
-- WHERE para apuntar solo a la cuenta correcta antes de ejecutar.
update perfiles set rol = 'administrador';
