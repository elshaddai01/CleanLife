# CleanLife backend

Node.js/Express API backed by PostgreSQL. Local development expects a database named `cleanlife_db`.

## Setup

1. Create the database:

   ```sql
   CREATE DATABASE cleanlife_db;
   ```

2. Copy `.env.example` to `.env`. Set your PostgreSQL username/password and replace every `change_this...` secret.
3. Install, migrate, and start:

   ```command prompt
   npm install
   npm run migrate
   npm start
   ```






## Commands

- `npm run migrate`: apply every pending numbered SQL migration once.
- `npm run check`: syntax-check the backend JavaScript.
- `npm run dev`: run with Node watch mode.
- `npm start`: start normally.
