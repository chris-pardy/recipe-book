# Recipe Book

A React application for managing recipes with Bluesky OAuth authentication.

## Authentication Setup

This application uses Bluesky OAuth for authentication via the `@atproto/oauth-client-browser` library.

### Client Metadata Configuration

The OAuth client requires a `client-metadata.json` file that must be accessible at the root of your application. For production deployments, you should:

1. **Update `public/client-metadata.json`** with your production URLs:
   - Update `client_id` to your production client metadata URL
   - Update `client_uri` to your production domain
   - Update `redirect_uris` to your production callback URLs

2. **Or use environment variables**:
   - Set `VITE_CLIENT_METADATA_URL` to your production client metadata URL
   - The app will use this instead of the origin-based URL

### OAuth Flow

The application uses the **authorization code flow**:
1. User enters their Bluesky handle (e.g., `username.bsky.social`)
2. User is redirected to Bluesky for authorization
3. Bluesky redirects back with an authorization code
4. The app exchanges the code for an access token
5. Session is stored and persisted

### Session Management

- OAuth sessions are managed by the `@atproto/oauth-client-browser` library's internal storage
- A reference to the session (DID and handle) is stored in `localStorage` for quick access
- Both storage mechanisms must be in sync for proper session management

### Development

For local development, the default `client-metadata.json` uses `http://localhost:5173`. Make sure your Vite dev server matches this port.

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
