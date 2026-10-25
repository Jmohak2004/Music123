# Echo

Echo is a shared listening room for friends who want to press play together.

## Development

```bash
npm install
npm run dev
```

Build the production bundle with:

```bash
npm run build
```

## Structure

- `src/App.jsx` contains the landing page sections and join-room interaction.
- `src/main.jsx` mounts the React application.
- `styles.css` contains the responsive visual system.
- `vite.config.js` configures the React build.

## Product flow

1. A host creates a private room.
2. Echo generates a room code.
3. Friends join with that code.
4. The host controls playback while the room listens together.
