# Manifestation

**Tu vida, a tu manera.** Un espacio visual para construir deseos, volver a ellos cada día y acompañarlos con preparación concreta.

Una aplicación real en español, adaptable a móvil y escritorio. El punto de partida es el deseo de cada persona: un auto, una profesión, una experiencia, una casa, una rutina o algo que no cabe en ninguna categoría.

## Empezar en VS Code

Requiere **Node.js 24 o superior**. No hay dependencias de npm que instalar.

```bash
git clone https://github.com/aldocelle/manifestation.git
cd manifestation
git checkout feat/manifestation-app
cp .env.example .env
npm start
```

Abre `http://localhost:3000`. Para desarrollo: `npm run dev`. Para comprobar: `npm run check` y `npm test`.

## Qué incluye

- 192 propuestas editables en 16 categorías: viajes, autos y rutas, trabajo y propósito, casas y espacios, jardín y naturaleza, moda y expresión, aventura, vida cotidiana, música y espectáculos, aprendizaje, bienestar, vínculos, gastronomía, proyectos y libertad, paisajes y climas, y sueños libres.
- 40 archivos fotográficos locales de referencia (algunas fotos se comparten entre categorías), con fuentes y licencia en `public/assets/credits.json`. Las tarjetas son propuestas, no 192 fotografías únicas. El nombre del sueño no significa que la foto represente exactamente ese modelo, profesión o lugar.
- Editor de título, intención, detalles persistentes, lugar, emoción, estilo, clima, color y estado del sueño. Carga de JPG/PNG/WebP, con reducción de tamaño en el navegador.
- Tableros con hasta 40 piezas arrastrables, referencias fotográficas, símbolos y notas. Se pueden mover con flechas, cambiar tamaño, rotar y eliminar. Vehículo ilustrado con color personalizable.
- Hasta 50 sueños por espacio, cambio entre tableros, buscador, filtros y favoritos.
- Panel diario con preguntas y sugerencias relacionadas con el deseo; cambian según el día. Son contenido editorial determinista, no noticias ni datos de destinos verificados automáticamente.
- Ejercicio opcional de respiración, diario, gratitud, avances, pasos y seguimiento de acciones completadas.
- Exportación PNG del tablero, respaldo JSON e importación validada. La exportación de imágenes requiere tener sus archivos disponibles; no se permiten URLs arbitrarias.
- Cuentas con contraseñas derivadas con scrypt, sesiones HttpOnly, SQLite y separación de datos por usuario. Al iniciar sesión se elige conservar el tablero local o recuperar el de la cuenta.
- Generación opcional de escenas con OpenAI desde el servidor, cuotas por usuario, historial y recuperación de escenas anteriores.
- Recordatorio local mientras la aplicación está abierta, sujeto al soporte de notificaciones del navegador.
- Correo diario opcional con una imagen y una sugerencia, zona horaria y horario personales. Requiere verificar el correo con un código antes de activarlo. La imagen puede ser una referencia existente o una nueva escena con IA si el usuario activa esa opción.

## IA y correo: activar servicios

Edita `.env` en el servidor. **Nunca subas las claves al repositorio ni las incluyas en el frontend.**

```dotenv
PUBLIC_URL=https://tu-dominio.cl
HOST=0.0.0.0
COOKIE_SECURE=true
OPENAI_API_KEY=tu_clave_servidor
OPENAI_IMAGE_MODEL=gpt-image-2
AI_DAILY_LIMIT=5
RESEND_API_KEY=tu_clave_servidor
MAIL_FROM=Manifestation <inspiracion@tu-dominio.cl>
```

OpenAI necesita una cuenta API habilitada, saldo y acceso al modelo elegido. Las generaciones tienen costo. El modelo se puede cambiar sin modificar código. Resend necesita un remitente con dominio verificado. Sin claves, las funcionalidades correspondientes se muestran como no disponibles; no se simula una generación ni un envío.

El servidor debe mantenerse encendido para enviar recordatorios con la app cerrada. Revisa cada minuto los horarios en la zona configurada; si se reinicia después de la hora, recupera el envío del día. Usa una clave de idempotencia por cuenta y día para evitar duplicar correos. SQLite registra el estado y la imagen de cada envío. La imagen diaria generada se entrega por correo; las generaciones manuales se incorporan al tablero y su historial.

Los prompts conservan los detalles escritos entre escenas. No hay edición de referencia ni un motor 3D: el modelo puede interpretar diferente un mismo objeto. Una fotografía subida se usa como referencia visible del tablero; no se transmite como imagen al modelo. La generación no promete conservar una identidad visual exacta.

## Despliegue con servidor

Puede ejecutarse en un VPS o alojamiento que admita Node 24 y un disco persistente. No funciona como backend en un hosting que solo admita PHP, ni en un sitio estático. Configura HTTPS mediante el proxy de tu proveedor y usa `PUBLIC_URL` con el origen exacto de la app.

```bash
cp .env.example .env
# Configura .env antes de iniciar.
docker compose up -d --build
```

El contenedor escucha en el puerto 3000 y el compose lo expone solo a `127.0.0.1`. Coloca tu proxy HTTPS delante. El volumen `manifestation-data` conserva usuarios, sesiones e imágenes. Realiza respaldos del volumen; para una copia consistente de SQLite, detén la aplicación o usa la API de backup de SQLite. La implementación está pensada para una sola instancia; varias réplicas necesitan coordinación de trabajos y una base compartida.

El registro usa correo y contraseña; la verificación habilita los envíos. La recuperación de contraseña y la eliminación autónoma de cuentas no están implementadas: añadir esos flujos y definir una política de privacidad/retención antes de un lanzamiento público con terceros. No hay pagos ni suscripciones.

## Versión visual estática

`public/` también puede servirse como frontend estático. Permite editar y guardar en el navegador, explorar el catálogo, llevar el diario y exportar respaldos/imágenes. En ese modo no hay cuentas, sincronización, generación IA ni correos. La interfaz lo indica al intentar usar la cuenta. Para conservar datos, exporta el respaldo JSON; borrar los datos del navegador elimina el tablero local.

## Arquitectura

```text
public/                 Interfaz ES modules sin compilación
  app.js                Navegación, tablero, diario, cuenta, exportación
  catalog.js            Catálogo, estilos, preguntas y prompts
  schema.js             Validación compartida cliente/servidor
  style.css             Interfaz responsive
  assets/               Referencias fotográficas y créditos
server.mjs              HTTP, cuentas, SQLite, IA y programador de correos
test/app.test.mjs        Pruebas de integración y validación
.data/                  Datos privados, ignorados por Git
```

No hay rastreo analítico. Los deseos se almacenan en el dispositivo o en la cuenta; si el usuario genera una imagen, el texto de su sueño y los detalles se envían a OpenAI. Al activar correos se envían dirección, texto e imagen a Resend. Las fuentes de Google Fonts hacen una solicitud externa; si no están disponibles se usan fuentes del sistema.

## Referencias de estilo

Selección editorial consultada el 18 de octubre de 2026: [Pinterest Predicts 2026](https://business.pinterest.com/pinterest-predicts/) — Neo Deco, Cool Blue, Glamoratti, Poetcore, Khaki Coded y viajes de aventura, junto con estilos atemporales. No se presenta como un catálogo de tendencias actualizado automáticamente.

Las fotografías se distribuyen según la [licencia de Unsplash](https://unsplash.com/license). Los enlaces exactos a los archivos originales están en los créditos. Para volver a descargar: `node download-assets.mjs`.

## Alcance de validación

Pruebas automatizadas para catálogo, datos importados, autenticación, aislamiento entre cuentas, sesiones, CSRF, disponibilidad de activos y estados de servicios no configurados. Las llamadas de proveedor se prueban con respuestas controladas; la integración real requiere claves y una comprobación en el alojamiento final. No se ejecutó una revisión visual automatizada de navegador en este entorno.
