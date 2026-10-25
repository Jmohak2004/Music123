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

## Backend

The Node service provides room creation, room lookup, joining, chat, listener
presence, and host playback events over Socket.IO.

```bash
npm run server
```

Run the realtime smoke test while the server is running in another terminal:

```bash
npm run test:integration
```

Set `VITE_API_URL` when the frontend and backend run on different origins:

```bash
VITE_API_URL=https://your-echo-api.onrender.com npm run build
```

### Render

Create a Render Web Service from this repository, or use the included
`render.yaml`. Set `CLIENT_ORIGIN` to the deployed frontend URL, then use the
generated Render URL as `VITE_API_URL` for the Vercel frontend deployment.

The current room store is in memory. It supports multiple simultaneous rooms
on one Render instance, but rooms reset when the service restarts or scales.
The next production step is moving `rooms` to Redis or a database.

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
