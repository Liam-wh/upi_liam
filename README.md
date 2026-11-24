# UPI Alumni · ONCE

## De GitHub a Vercel

1. Extrae el ZIP. Sube el contenido de la carpeta a un repositorio de GitHub, incluidos .gitignore y vercel.json. app.py debe quedar en la raíz del repositorio.
2. En Vercel selecciona Add New → Project e importa ese repositorio. Usa la raíz del repositorio como Root Directory. Vercel detecta Flask.
3. Antes de desplegar, agrega GEMINI_API_KEY en Environment Variables. Pega la clave como valor y selecciona Production. Si también pruebas despliegues de Preview, configúrala en ese entorno. Obtén tu clave en [Google AI Studio](https://aistudio.google.com/apikey).
4. Pulsa Deploy. Si agregaste la variable después, abre Deployments y selecciona Redeploy. Para tu dominio, usa Settings → Domains y sigue los registros DNS indicados.
5. Abre la URL publicada, pulsa ONCE y envía una pregunta. La etiqueta «Con Gemini» después de la respuesta confirma una consulta real. Ante un fallo, la guía local sigue disponible y el pie del chat indica el motivo disponible. El modelo predeterminado es gemini-3.1-flash-lite. Puedes elegir otro modelo compatible con salida JSON estructurada mediante GEMINI_MODEL en Vercel.

## Probar en Windows y VS Code

Con Python 3.12 instalado, abre esta carpeta en VS Code. Copia .env.example como .env y completa GEMINI_API_KEY solo en tu equipo. Desde la terminal ejecuta `.\Abrir-Alumni.cmd`. La clave se carga en Flask. El navegador se comunica con /api/once y el servidor consulta a Google por HTTPS.

## Admisiones

El formulario de inscripción envía las solicitudes mediante FormSubmit. El panel «QR de pago» conserva la imagen original de titulaciones y ofrece su descarga. El botón de WhatsApp abre la conversación con +591 63257678 para que el participante adjunte el comprobante.
