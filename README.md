# Open Speed Meter

Open Speed Meter is a lightweight, self-hosted alternative to Open-SpeedTest. It measures ping, download, and upload performance using a Node.js backend and a modern web interface.

## Features

- ⚡️ Real-time status updates while the test runs
- 📈 Download and upload throughput measurements using binary payloads
- 📉 Latency (ping) measurement via multiple round trips
- 🎨 Responsive, glassmorphism-inspired UI built with vanilla HTML, CSS, and JavaScript

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer

### Installation

```bash
npm install
```

### Running the server

```bash
npm start
```

The application will be available at [http://localhost:3000](http://localhost:3000).

For development with auto-reload:

```bash
npm run dev
```

## How it works

1. **Ping test** — Sends a series of quick requests to `/api/ping` and averages the round-trip time.
2. **Download test** — Downloads several binary payloads from `/api/download` and calculates the average throughput.
3. **Upload test** — Generates random binary data in the browser, posts it to `/api/upload`, and measures the time taken.

The UI updates in real time to show progress and final results in Mbps (for throughput) and milliseconds (for latency).

## Project structure

```
├── public/
│   ├── app.js        # Client-side test orchestration and UI updates
│   ├── index.html    # Application markup
│   └── styles.css    # Glassmorphism-inspired styling
├── server.js         # Express server and test endpoints
├── package.json      # Project metadata and dependencies
└── README.md         # Project overview and usage instructions
```

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).
