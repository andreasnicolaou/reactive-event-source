# reactive-event-source

![GitHub package.json version](https://img.shields.io/github/package-json/v/andreasnicolaou/reactive-event-source)
![GitHub contributors](https://img.shields.io/github/contributors/andreasnicolaou/reactive-event-source)
![GitHub License](https://img.shields.io/github/license/andreasnicolaou/reactive-event-source)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/andreasnicolaou/reactive-event-source/build.yaml)
[![Known Vulnerabilities](https://snyk.io/test/github/andreasnicolaou/reactive-event-source/badge.svg)](https://snyk.io/test/github/andreasnicolaou/reactive-event-source)
![Bundle Size](https://deno.bundlejs.com/badge?q=@andreasnicolaou/reactive-event-source&treeshake=[*])

![ESLint](https://img.shields.io/badge/linter-eslint-4B32C3.svg?logo=eslint)
![Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?logo=prettier)
![Jest](https://img.shields.io/badge/tested_with-jest-99424f.svg?logo=jest)
![Maintenance](https://img.shields.io/maintenance/yes/2026)
[![codecov](https://codecov.io/gh/andreasnicolaou/reactive-event-source/graph/badge.svg?token=354U0TAVZG)](https://codecov.io/gh/andreasnicolaou/reactive-event-source)

![NPM Downloads](https://img.shields.io/npm/dm/%40andreasnicolaou%2Freactive-event-source)

A lightweight, production-ready reactive wrapper around EventSource using RxJS, providing automatic reconnection, memory leak prevention, and reactive state management.

## Features

- **Automatic reconnection** with configurable exponential backoff
- **Enhanced timeout handling** with race condition prevention
- **Memory leak prevention** with proper subscription cleanup
- **Reactive state tracking** with `readyState$` observable
- **Improved error recovery** with state-based retry logic
- **Modern build system** using Rollup (ESM, CommonJS and UMD bundles)
- **TypeScript-first** with full type safety
- **Simplified API** - removed confusing buffer options
- **Event buffering** using ReplaySubject(1) - never miss the last message
- **Clean RxJS API** with no callback hell
- **Configurable retry strategies**
- **Browser-optimized** - no Node.js dependencies

## Installation

### Package Managers

```bash
# npm
npm install @andreasnicolaou/reactive-event-source

# yarn
yarn add @andreasnicolaou/reactive-event-source

# pnpm
pnpm add @andreasnicolaou/reactive-event-source
```

### Via CDN

For browser usage without a build system, you can include the library directly from a CDN:

```html
<!-- unpkg CDN (latest version, unminified) -->
<script src="https://unpkg.com/@andreasnicolaou/reactive-event-source/dist/index.umd.js"></script>

<!-- unpkg CDN (latest version, minified) -->
<script src="https://unpkg.com/@andreasnicolaou/reactive-event-source/dist/index.umd.min.js"></script>

<!-- jsDelivr CDN (unminified) -->
<script src="https://cdn.jsdelivr.net/npm/@andreasnicolaou/reactive-event-source/dist/index.umd.js"></script>

<!-- jsDelivr CDN (minified) -->
<script src="https://cdn.jsdelivr.net/npm/@andreasnicolaou/reactive-event-source/dist/index.umd.min.js"></script>
```

The library will be available as `reactiveEventSource` on the global scope:

```html
<script>
  const eventSource = new reactiveEventSource.ReactiveEventSource('https://api.example.com/stream');
  eventSource.on('message').subscribe((event) => {
    console.log('Received:', event.data);
  });
</script>
```

## Usage

You can use this library in any modern JavaScript environment:

### ESM (ECMAScript Modules)

```js
import { ReactiveEventSource } from '@andreasnicolaou/reactive-event-source';

const eventSource = new ReactiveEventSource('https://api.example.com/stream');
eventSource.on('message').subscribe((event) => {
  console.log('Received:', event.data);
});
```

### CommonJS (Node.js require)

```js
const { ReactiveEventSource } = require('@andreasnicolaou/reactive-event-source');

const eventSource = new ReactiveEventSource('https://api.example.com/stream');
eventSource.on('message').subscribe((event) => {
  console.log('Received:', event.data);
});
```

### UMD (CDN/Browser)

```html
<script src="https://unpkg.com/@andreasnicolaou/reactive-event-source/dist/index.umd.min.js"></script>
<script>
  const { ReactiveEventSource } = reactiveEventSource;
  const eventSource = new ReactiveEventSource('https://api.example.com/stream');
  eventSource.on('message').subscribe((event) => {
    console.log('Received:', event.data);
  });
</script>
```

## API

### Constructor

| Signature                                                                            | Description                          |
| ------------------------------------------------------------------------------------ | ------------------------------------ |
| `new ReactiveEventSource(url: string \| URL, options?: Partial<EventSourceOptions>)` | Creates a new SSE connection manager |

### Options

| Property            | Type      | Default | Description                                                                                                                                                                                 |
| ------------------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxRetries`        | `number`  | `3`     | How many times the EventSource is re-created after a fatal failure before the streams error. Counts consecutive failures and resets on every successful `open`. `Infinity` retries forever. |
| `initialDelay`      | `number`  | `1000`  | Base delay before the first retry, in ms. Doubles on each consecutive failure.                                                                                                              |
| `maxDelay`          | `number`  | `10000` | Upper bound for the base delay, in ms.                                                                                                                                                      |
| `connectionTimeout` | `number`  | `15000` | How long each attempt waits for `open` before it counts as failed, in ms.                                                                                                                   |
| `withCredentials`   | `boolean` | `false` | Send cookies with requests                                                                                                                                                                  |

### Methods

| Method                               | Returns                    | Description                                                                                                                                                                                                                                                        |
| ------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.on(eventType: string = 'message')` | `Observable<MessageEvent>` | Returns a hot observable that:<br>• Opens the shared connection on the first `on()` call, even before anyone subscribes<br>• Replays the last event to late subscribers<br>• Errors with `EventSourceError` once retries are exhausted<br>• Completes on `close()` |
| `.on('open')` / `.on('error')`       | `Observable<Event>`        | The native `open` and `error` events. These are plain `Event` objects, not `MessageEvent`.                                                                                                                                                                         |
| `.close()`                           | `void`                     | Closes the connection, removes all listeners and completes every stream. Safe to call more than once.                                                                                                                                                              |

### Properties

| Property           | Type                 | Values                                      | Description                                                                         |
| ------------------ | -------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `.readyState`      | `number`             | `0`: CONNECTING<br>`1`: OPEN<br>`2`: CLOSED | Current connection state getter. Automatically updates during reconnections.        |
| `.readyState$`     | `Observable<number>` | `0`: CONNECTING<br>`1`: OPEN<br>`2`: CLOSED | Emits the current state, then every change. Consecutive duplicates are skipped.     |
| `.withCredentials` | `boolean`            | `true`/`false`                              | Indicates if credentials are sent with requests (set at construction)               |
| `.URL`             | `string`             | -                                           | Readonly resolved endpoint URL. Returns string even if constructed with URL object. |

### Observable Behavior

✅ **Memory Safe**: Proper subscription cleanup prevents memory leaks  
✅ **Event Buffering**: Uses ReplaySubject(1) to buffer the last event  
✅ **Automatic Reconnection**: Exponential backoff with configurable limits  
✅ **Shared Subscriptions**: One EventSource is shared by every event type and subscriber  
✅ **Reactive State**: `readyState$` observable for real-time connection monitoring  
✅ **Clean Completion**: All observables complete when connection closes

### Connection States

| State      | Value | Description             |
| ---------- | ----- | ----------------------- |
| CONNECTING | `0`   | Establishing connection |
| OPEN       | `1`   | Connection active       |
| CLOSED     | `2`   | Connection terminated   |

## Reconnection

There are two kinds of connection loss, and they are handled differently.

- **Temporary drops** are handled by the browser. A native EventSource reconnects on its own and resends `Last-Event-ID`, so the server can resume where it left off. `readyState` goes to `0` and back to `1`, streams stay open, and no retry is counted.
- **Fatal failures** are handled by this library. When the browser gives up, for example on a non-200 response, or when `open` does not arrive within `connectionTimeout`, the EventSource is closed and a new one is created after a backoff delay. Existing subscribers keep receiving events from the new connection.

The delay before retry _n_ is a random value between half and all of `min(initialDelay × 2^(n-1), maxDelay)`. With the defaults that is 0.5–1 s, then 1–2 s, then 2–4 s. After `maxRetries` consecutive failures every stream errors with an `EventSourceError` and `readyState` stays `2`. The retry budget resets every time a connection opens, so a long-lived stream survives any number of separate outages.

An errored instance stays errored. To start again, call `close()` and create a new `ReactiveEventSource`.

## Error Handling

Terminal failures arrive in the subscriber's `error` callback as an `EventSourceError`. The native `error` events from `on('error')` are plain `Event` objects and do not end the stream.

```ts
import { ReactiveEventSource, EventSourceError } from '@andreasnicolaou/reactive-event-source';

const eventSource = new ReactiveEventSource('https://api.example.com/stream');

eventSource.on('message').subscribe({
  next: (event) => console.log('Received:', event.data),
  error: (error) => {
    if (error instanceof EventSourceError) {
      console.log('Gave up:', error.reason); // e.g. "Connection closed (retries exhausted)"
      console.log('Retries made:', error.attempt);
      console.log('Underlying error:', error.cause);
    }
  },
});

// Optional: observe transient native errors without ending anything
eventSource.on('error').subscribe((event) => console.warn('EventSource error event', event));
```

## Polyfill for Node.js / Web Workers / Legacy Environments

This library looks up `EventSource` on `globalThis`, so it works in browsers and Web Workers. If you're running in an environment where EventSource is not defined (such as Node.js), you can globally provide a compatible implementation. Without one, the streams error with an `EventSourceError` instead of throwing.

```ts
// Only do this once, at the top level of your application
globalThis.EventSource = /* your EventSource-compatible implementation */;
```

## Contributing

Contributions are welcome! If you encounter issues or have ideas to enhance the library, feel free to submit an issue or pull request.
