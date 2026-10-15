# RLPRODUCTOS-ADMIN (feature/remitos-admin) - combos UI

Se añadió gestión de combos en la interfaz de administración:
- Lista desplegable para seleccionar combos
- Crear / editar combos con título, lista de códigos y foto
- Borrar combos (con deshacer)
- Al guardar un combo con imagen, la imagen se sube a `imagenes/` en el repo target y el campo `foto` en `combos.json` se actualiza

Cómo funciona:
- Desde la UI, seleccioná un combo en la lista desplegable y usá "Editar Combo" o "Borrar Combo".
- Para crear o editar un combo se abre un editor que acepta un archivo de imagen; el archivo se sube al repo target con nombre derivado del título del combo (espacios -> guiones, uppercase).

Se usa el mismo patrón de reintentos y merge por conflicto que para `datos-productos.json`.
