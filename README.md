# SafeBackup

Aplicación móvil de backup seguro para Android e iOS, desarrollada con React Native (Expo) y un backend Node.js.

## ¿Qué es SafeBackup?

SafeBackup te permite hacer copias de seguridad de tus fotos, contactos y documentos directamente desde tu teléfono. Podés elegir dónde guardar el backup: en tu tarjeta SD, un pendrive USB/OTG, o en nuestra nube segura.

## Características principales

- **Cuentas de usuario**: Registrate e iniciá sesión para acceder a tus backups desde cualquier dispositivo.
- **Selección flexible**: Elegí qué querés respaldar — fotos, contactos, documentos, o una selección personalizada.
- **Múltiples destinos**: Guardá en tarjeta SD, USB/OTG o en la nube de SafeBackup.
- **Historial de backups**: Consultá todos tus backups anteriores, filtrados por dispositivo o destino.
- **Restauración**: Restaurá archivos individuales o backups completos con un par de toques.

## Estructura del proyecto

```
safebackup/
├── backend/          # API Node.js + Express + SQLite
│   ├── src/
│   │   ├── db.js
│   │   ├── index.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── backups.js
│   │       └── devices.js
│   ├── .env.example
│   └── package.json
└── mobile/           # App React Native con Expo
    ├── src/
    │   ├── components/
    │   ├── context/
    │   ├── navigation/
    │   ├── screens/
    │   ├── services/
    │   └── theme/
    ├── App.js
    ├── app.json
    └── package.json
```

## Cómo correr el proyecto

### Backend

```bash
cd backend
cp .env.example .env
# Editá .env con tus valores
npm install
npm run dev
```

### App móvil

```bash
cd mobile
npm install
npm start
# Escaneá el QR con Expo Go en tu teléfono
```

## Tecnologías utilizadas

- **Mobile**: React Native, Expo, React Navigation, Axios, AsyncStorage
- **Backend**: Node.js, Express, SQLite (better-sqlite3), JWT, bcrypt, Multer
