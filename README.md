# reactive-event-source

![GitHub package.json version](https://img.shields.io/github/package-json/v/andreasnicolaou/reactive-event-source)
![GitHub contributors](https://img.shields.io/github/contributors/andreasnicolaou/reactive-event-source)
![GitHub License](https://img.shields.io/github/license/andreasnicolaou/reactive-event-source)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/andreasnicolaou/reactive-event-source/build.yaml)
[![Known Vulnerabilities](https://snyk.io/test/github/andreasnicolaou/reactive-event-source/badge.svg)](https://snyk.io/test/github/andreasnicolaou/reactive-event-source)
![Bundle Size](https://deno.bundlejs.com/badge?q=@andreasnicolaou/reactive-event-source@1.3.0&treeshake=[*])

![ESLint](https://img.shields.io/badge/linter-eslint-4B32C3.svg?logo=eslint)
![Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?logo=prettier)
![Jest](https://img.shields.io/badge/tested_with-jest-99424f.svg?logo=jest)
![Maintenance](https://img.shields.io/maintenance/yes/2025)

![NPM Downloads](https://img.shields.io/npm/dm/%40andreasnicolaou%2Freactive-event-source)

A lightweight, production-ready reactive wrapper around EventSource using RxJS, providing automatic reconnection, memory leak prevention, and reactive state management.

## Features

- **Automatic reconnection** with configurable exponential backoff
- **Enhanced timeout handling** with race condition prevention
- **Memory leak prevention** with proper subscription cleanup
- **Reactive state tracking** with `readyState$` observable
- **Improved error recovery** with state-based retry logic
- **Modern build system** using Rollup (ESM + UMD bundles)
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

```ts
import { ReactiveEventSource } from '@andreasnicolaou/reactive-event-source';

const eventSource = new ReactiveEventSource('https://api.example.com/stream');

// Subscribe to standard events
eventSource.on('open').subscribe(() => console.log('Connected'));
eventSource.on('error').subscribe((err) => console.error('Error:', err));

// Listen for custom events
eventSource.on('update').subscribe((event) => {
  console.log('New update:', event.data);
});

// Track connection state reactively
eventSource.readyState$.subscribe((state) => {
  console.log('Connection state:', state); // 0=CONNECTING, 1=OPEN, 2=CLOSED
});

// Get current state synchronously
console.log('Current state:', eventSource.readyState);
console.log('Using credentials:', eventSource.withCredentials);
console.log('Connected to:', eventSource.URL);

// Clean up when done
eventSource.close();
```

## API

### Constructor

| Signature                                                                            | Description                          |
| ------------------------------------------------------------------------------------ | ------------------------------------ |
| `new ReactiveEventSource(url: string \| URL, options?: Partial<EventSourceOptions>)` | Creates a new SSE connection manager |

### Options

| Property            | Type      | Default | Description                          |
| ------------------- | --------- | ------- | ------------------------------------ |
| `maxRetries`        | `number`  | `3`     | Maximum retry attempts on failure    |
| `initialDelay`      | `number`  | `1000`  | Initial retry delay in ms            |
| `maxDelay`          | `number`  | `10000` | Maximum retry delay in ms            |
| `connectionTimeout` | `number`  | `15000` | Timeout for initial connection in ms |
| `withCredentials`   | `boolean` | `false` | Send cookies with requests           |

### Methods

| Method                               | Returns                    | Description                                                                                                                                                                            |
| ------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.on(eventType: string = 'message')` | `Observable<MessageEvent>` | Returns hot observable that:<br>• Buffers last event with ReplaySubject(1)<br>• Auto-reconnects with exponential backoff<br>• Properly cleans up subscriptions<br>• Completes on close |
| `.close()`                           | `void`                     | Closes connection and cleans up all resources (prevents memory leaks)                                                                                                                  |

### Properties

| Property           | Type                 | Values                                      | Description                                                                         |
| ------------------ | -------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `.readyState`      | `number`             | `0`: CONNECTING<br>`1`: OPEN<br>`2`: CLOSED | Current connection state getter. Automatically updates during reconnections.        |
| `.readyState$`     | `Observable<number>` | `0`: CONNECTING<br>`1`: OPEN<br>`2`: CLOSED | Reactive observable that emits connection state changes in real-time.               |
| `.withCredentials` | `boolean`            | `true`/`false`                              | Indicates if credentials are sent with requests (set at construction)               |
| `.URL`             | `string`             | -                                           | Readonly resolved endpoint URL. Returns string even if constructed with URL object. |

### Observable Behavior

✅ **Memory Safe**: Proper subscription cleanup prevents memory leaks  
✅ **Event Buffering**: Uses ReplaySubject(1) to buffer the last event  
✅ **Automatic Reconnection**: Exponential backoff with configurable limits  
✅ **Shared Subscriptions**: Efficient sharing between multiple subscribers  
✅ **Reactive State**: `readyState$` observable for real-time connection monitoring  
✅ **Clean Completion**: All observables complete when connection closes

### Connection States

| State      | Value | Description             |
| ---------- | ----- | ----------------------- |
| CONNECTING | `0`   | Establishing connection |
| OPEN       | `1`   | Connection active       |
| CLOSED     | `2`   | Connection terminated   |

## Error Handling

The library exports a custom `EventSourceError` class for enhanced error handling:

```ts
import { ReactiveEventSource, EventSourceError } from '@andreasnicolaou/reactive-event-source';

const eventSource = new ReactiveEventSource('https://api.example.com/stream');

eventSource.on('error').subscribe((error) => {
  if (error instanceof EventSourceError) {
    console.log('EventSource error:', error.message);
    console.log('Retry attempt:', error.attempt);
  }
});
```

## Polyfill for Node.js / Legacy Environments

This library depends on the EventSource API, which is available in most modern browsers. If you're running in an environment where EventSource is not defined (such as Node.js), you can globally provide a compatible implementation:

```ts
// Only do this once, at the top level of your application
globalThis.EventSource = /* your EventSource-compatible implementation */;
```

## Contributing

Contributions are welcome! If you encounter issues or have ideas to enhance the library, feel free to submit an issue or pull request.
