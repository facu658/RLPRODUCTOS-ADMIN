# RLPRODUCTOS-ADMIN (feature/remitos-admin)

Esta rama agrega una interfaz administrativa mínima que lee y escribe `datos-productos.json` en el repo target (por defecto `facu658/RLPRODUCTOS-WEB`) y sube imágenes a la carpeta `imagenes/` del repo target usando la GitHub Contents API.

Guía rápida:
- Abre `index.html` en un servidor local (Live Server, http-server, o desplegado como GitHub Pages en este repo).
- Introduce un token personal con permisos `repo` para operaciones de contenido en `RLPRODUCTOS-WEB`.
- Configura owner/repo si no están bien.
- Usa la UI para editar productos, subir imágenes y generar remitos PDF.

Notas importantes:
- El token NO se guarda en el repositorio; se mantiene en memoria en el navegador.
- Reemplazar imágenes con diferente nombre eliminará el archivo anterior del repo (commit) cuando sea posible.
- Para la generación de PDFs usamos `pdf-lib` en el navegador. El archivo se descarga y también se intenta subir a `remitos/` en el repo target.

Limitaciones y mejoras futuras:
- Manejo de conflictos concurrentes: se reintenta al guardar pero podría mejorar con un mecanismo de lock/counter.
- Validaciones y sanitización más robustas.
- UI/UX: paginación y previews mejoradas.
