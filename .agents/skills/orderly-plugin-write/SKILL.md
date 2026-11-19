---
name: orderly-plugin-write
description: Use when the user wants to write / develop Orderly plugin code — including interceptors, hooks, lifecycle hooks, component patterns, and best practices. Triggers on "develop Orderly plugin", "write plugin", "add interceptor", "plugin architecture", "Orderly hooks", "plugin component", "Orderly SDK patterns".
---

# Orderly plugin — develop (SDK patterns)

Write plugin code after scaffolding. Covers architecture, interceptor strategies, hooks usage, and best practices.

## When to use

- User has scaffolded a plugin with **[orderly-plugin-create](../orderly-plugin-create/SKILL.md)** and wants to write the actual plugin code.
- User wants to add or modify interceptors, hooks, lifecycle logic.

## Three Core Principles

1. **Direct SDK Package Usage**
   - Plugins can use `@orderly.network/hooks`, `@orderly.network/ui`, `@orderly.network/utils` directly — same as in host apps.

2. **Only SDK-Declared Injectable Targets Can Be Intercepted**
   - UI modifications use **interceptor pattern**, not traditional slots.
   - Use the **Inspector tool** to discover available target paths.
   - Specify a **component path** (e.g., `Trading.OrderEntry.SubmitSection`) to intercept.

3. **Docs-First with Orderly docs MCP server**
   - When writing plugin code, fetch API details from the **Orderly docs MCP server** first instead of guessing from memory.
   - Prioritize tools like `orderly_docs_search`, `orderly_docs_get_hook`, `orderly_docs_get_component`, and `orderly_docs_get_type` to confirm signatures and usage.
   - If examples are needed, use `orderly_docs_get_component_doc`, `orderly_docs_get_workflow`, or `orderly_docs_get_recipe`.

## Plugin Types

| Type | Definition | Integration | Typical Use Cases |
|------|-----------|-------------|-------------------|
| **Widget** | UI component mounted to a specific anchor via interceptor | Declare `target` in interceptor, SDK auto-injects | PnL analyzer, quick close button, fee display, navigation bars |
| **Page** | Complete page built with SDK UI & Hooks, routed by host | Host adds via its own router (React Router, Next.js, etc.) | Asset overview, order history, leaderboard, settings |
| **Layout** | Trading page layout container | Built-in layout plugins intercept `Trading.Layout.Desktop`; the SDK also exposes `Trading.Layout.Mobile` for direct interception | Multi-column layout, sidebar, responsive toggle |

### Widget Details

- **Mechanism**: Pass `{ target, component }` where `component: (Original, props, api) => ReactNode`
- **Flexibility**: No pre-reserved slots; dynamically inject into any declared-injectable component path

### Page Details

- **Mechanism**: Build as a normal React component using SDK UI & Hooks
- **Characteristics**: Standalone, no interceptor overhead, full layout control
- **SDK styling**: Use Tailwind CSS utility classes from Orderly SDK

### Layout Details

- **Constraint**: Trading page only. Built-in grid/split plugins currently target the desktop layout.
- **Dual usage**:
  - **Via plugin**: `OrderlyPluginProvider` + `registerLayoutSplitPlugin()`
  - **Via host props**: `layoutStrategy={gridStrategy}` + `getInitialLayout={() => ...}` on `TradingPage`
- **Built-in layouts**: `registerLayoutGridPlugin()` from `@orderly.network/layout-grid` (the strategy types themselves come from `@orderly.network/layout-core`)

## Plugin Structure

A plugin exports a **registration function**:

```typescript
export function registerMyPlugin(options = {}) {
  return (SDK: OrderlySDK) => {
    SDK.registerPlugin({
      id: "my-plugin",
      name: "My Plugin",
      version: "1.0.0",
      orderlyVersion: ">=3.0.0",

      interceptors: [
        { target: "...", component: (Original, props, api) => {...} },
      ],

      setup: (api) => { /* idempotent non-UI setup */ },

      onError: (error) => { /* error handling */ },
      onFallback: () => <div>Plugin unavailable</div>,
    });
  };
}
```

**Key**: The `component` function in an interceptor is a **plain function** (not a React component) — it cannot call Hooks directly. Return a wrapper component instead.

## Interceptor Strategies

The interceptor function: `component: (Original, props, api) => ReactNode`

### Strategy 1: Enhance (Add Content)

Render additional UI alongside `Original`:

```typescript
{
  target: "Trading.OrderEntry.SubmitSection",
  component: (Original, props, api) => {
    const BalanceWarning = () => {
      const { freeCollateral } = useCollateral();
      return (
        <div className="flex flex-col gap-2">
          {freeCollateral < 100 && (
            <div className="text-red-500 text-sm">Insufficient balance</div>
          )}
          <Original {...props} />
        </div>
      );
    };
    return <BalanceWarning />;
  },
}
```

### Strategy 2: Wrap (Add Container)

Wrap `Original` with a styled container or provider:

```typescript
{
  target: "OrderBook.Desktop.Asks",
  component: (Original, props, api) => {
    const CustomWrapper = () => (
      <div className="border border-blue-500 rounded">
        <div className="bg-blue-50 p-2 text-sm">Ask Side</div>
        <Original {...props} />
      </div>
    );
    return <CustomWrapper />;
  },
}
```

### Strategy 3: Replace (Substitute Component)

Ignore `Original` and render custom component. Use with caution:

```typescript
{
  target: "Trading.OrderEntry.SubmitSection",
  component: (Original, props, api) => (
    <button
      type="button"
      className="bg-green-500 text-white px-6 py-2 rounded"
      disabled={!props.canTrade || props.isMutating}
      onClick={props.onSubmit}
    >
      {props.buttonLabel}
    </button>
  ),
}
```

### Chaining

Multiple plugins on the same target chain: `Interceptor A -> Interceptor B -> Original`

## Hooks Usage in Interceptors

### ✅ Correct: Return a wrapper component that uses Hooks

```typescript
component: (Original, props, api) => {
  const Wrapper = () => {
    const { freeCollateral } = useCollateral();
    return (
      <div>
        <span>Available: {freeCollateral}</span>
        <Original {...props} />
      </div>
    );
  };
  return <Wrapper />;
}
```

### ❌ Incorrect: Hooks called directly in `component`

```typescript
component: (Original, props, api) => {
  const { freeCollateral } = useCollateral(); // ❌ Breaks Rules of Hooks
  return <div>{freeCollateral}</div>;
}
```

### Event Subscription

`OrderlyPluginProvider` does not currently consume a cleanup function returned by `setup`, and it may execute `setup` again when the resolved plugin list changes. Use `setup` only for idempotent non-UI work. For event subscriptions, prefer a wrapper component with `useEffect` cleanup and use `TrackerEventName` enum members.

```typescript
import { useEffect } from "react";
import { TrackerEventName } from "@orderly.network/types";

component: (Original, props, api) => {
  const Wrapper = () => {
    useEffect(() => {
      const handleOrderPlaced = (data: unknown) => {
        console.log("Order placed", data);
      };

      api.events.on(TrackerEventName.placeOrderSuccess, handleOrderPlaced);
      return () => {
        api.events.off(TrackerEventName.placeOrderSuccess, handleOrderPlaced);
      };
    }, [api]);

    return <Original {...props} />;
  };

  return <Wrapper />;
}
```

## Props Typing

### Approach A: `createInterceptor` (Recommended)

```typescript
import { createInterceptor } from "@orderly.network/plugin-core";
import "@orderly.network/ui"; // Loads Deposit.DepositForm props augmentation

interceptors: [
  createInterceptor("Deposit.DepositForm", (Original, props, api) => {
    // props automatically typed
    return <div onClick={props.onOk}>Custom Form</div>;
  }),
]
```

### Approach B: Manual Generic Type

```typescript
import type { PluginInterceptor, DepositFormProps } from "@orderly.network/ui";

const interceptor: PluginInterceptor<DepositFormProps> = {
  target: "Deposit.DepositForm",
  component: (Original, props, api) => { /* props typed */ },
};
```

### Approach C: Inline Annotation

```typescript
component: (Original, props: DepositFormProps, api) => { ... }
```

## Error Hooks and Lifecycle Status

| Hook | Timing | Use Cases |
|------|--------|-----------|
| `setup` | When the provider resolves the plugin | Idempotent non-UI setup only |
| `onError` | When interceptor throws | Custom error logging |
| `onFallback` | When fallback UI needed | Graceful degradation |

`onInitialize` and `onInstall` are present in the current TypeScript descriptor for forward compatibility, but `OrderlyPluginProvider` does not invoke them yet. Do not rely on them for initialization, compatibility checks, or side effects; use `setup` or host-level checks instead.

```typescript
onError: (error: Error) => {
  console.error("Plugin error:", error);
},

onFallback: () => <div>Plugin unavailable</div>,
```

## Best Practices

### Error Isolation
- Each interceptor wraps in `PluginErrorBoundary`
- If an interceptor crashes, only that slot shows blank/fallback — not the entire page

### Performance
- Interceptors use memoization — no cascade redraws
- Avoid expensive computations in `component` functions
- Memoize wrapper components if they receive frequently-changing props:

```typescript
const MyWrapper = React.memo(({ data, Original, props }) => {
  return <Original {...props} />;
});

component: (Original, props, api) => (
  <MyWrapper Original={Original} props={props} data={someData} />
)
```

### Plugin ID format (single rule)

Must match the **Marketplace API** wherever the plugin id appears (manifest `pluginId`, `registerPlugin({ id })`, CLI `--id`):

| Rule | Regex | Examples |
|------|--------|---------|
| Letter first; then letters, digits, hyphens only | `/^[a-zA-Z][a-zA-Z0-9-]*$/` | `my-plugin`, `orderly-onramp`, `pnlWidget` |

Do **not** treat `registerPlugin({ id })` as a separate camelCase-only rule — hyphenated ids are valid if they match the regex above.

## Registration Example

```typescript
export default function registerMyPlugin(options?: { theme?: string }) {
  return (SDK: OrderlySDK, state?: { orderlyVersion?: string }) =>
    SDK.registerPlugin({
      id: "my-plugin",
      name: "My Plugin",
      version: "1.0.0",

      onError: (error: Error) => {
        console.error("Plugin error:", error);
        // Send to error tracking service
      },

      onFallback: () => <div>Plugin unavailable</div>,

      interceptors: [
        /* ... */
      ],
      setup: (api) => {
        /* ... */
      },
    });
}
```

**Note**: `onInitialize`, `onInstall`, `onMount`, `onUnmount`, and `onDispose` are not currently invoked by `plugin-core`.

## Testing

- **Interceptor Props Validation**: Use TypeScript strict mode to catch prop mismatches early.
- **Error Scenarios**: Test error boundaries by intentionally throwing errors in interceptor components.
- **Performance**: Use browser DevTools Profiler to verify interceptor rendering doesn't trigger unnecessary redraws.

## Reference

[reference.md](reference.md) — shared interceptor targets list (keep in sync with CLI constants)
