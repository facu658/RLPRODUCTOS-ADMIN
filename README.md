# RLPRODUCTOS-ADMIN (feature/remitos-admin) - mejoras

Esta actualización mejora la experiencia de la Admin:
- Manejo de conflictos al guardar `datos-productos.json`: reintentos automáticos y merge por `codigo` cuando hay cambios concurrentes.
- Eliminación opcional de la foto anterior al reemplazar una imagen (checkbox en el editor).
- Eliminación con opción de deshacer (no se usan modales ni alertas confirm).
- Soporte para watermark en remitos: texto o imagen (PNG/JPG) en el generador de PDF.
- Mejoras UX: indicadores no modales, toasts con acción (Deshacer), y backoff simple en reintentos.

Instrucciones de uso siguen siendo las mismas que en README previo. Pega tu token en la UI antes de usar.
