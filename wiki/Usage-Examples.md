# Usage Examples

This page shows the kinds of requests HA ChatGPT Gateway is designed to support after the relevant Home Assistant entities and domains have been explicitly allowed.

Actual entity IDs, services, fields, and supported values come from your Home Assistant installation.

## Basic state checks

Examples:

```text
Is the bedroom light on?
```

```text
What is the current temperature reported by the NAS sensor?
```

```text
Is the dishwasher on or off?
```

The GPT should discover or use an already known allowed entity and read its current state before answering.

## Turning a light or switch on and off

Examples:

```text
Turn on the desk lamp.
```

```text
Turn off the storage-room light.
```

```text
Turn the test plug off, then verify its state.
```

Some physical lamps may appear in Home Assistant as `switch.*` rather than `light.*`, so discovery should consider the actual entity model rather than the natural-language name alone.

## Multiple explicit devices

Example:

```text
Turn off the desk lamp and the bedside lamp.
```

When the same service and data are valid for several explicit allowed entities, the gateway can target them together.

A request such as "turn off everything" should not be translated into a domain-wide call. The GPT should resolve the intended explicit entities first.

## Climate control

Example:

```text
Set the bedroom air conditioner to cool mode at 25 °C with medium fan speed.
```

A climate request may require several Home Assistant services. The GPT should:

1. read the climate entity state;
2. inspect each required live service contract;
3. use only supported modes and fields;
4. submit one short ordered batch when several related services are necessary;
5. re-read state when useful to verify the result.

The gateway does not hard-code climate-specific service fields.

## Covers and positions

Example:

```text
Set the living-room blind to 40 percent.
```

Before acting, the GPT should confirm the allowed cover entity and inspect the relevant service contract.

Covers can have safety or security implications. Do not expose doors, gates, garage doors, or other high-impact covers casually.

## Sensors and diagnostics

Examples:

```text
What is the CPU temperature of my home server?
```

```text
Show me the current power consumption of the water cooler.
```

```text
Which of the selected devices is currently unavailable?
```

Sensor access is read-only unless a separate writable entity/service is involved.

## Energy analysis

Example:

```text
Compare this appliance's energy use during the last seven days with the previous seven days.
```

For evidence-based analysis, explicitly allow the relevant power and energy sensors, for example:

```text
sensor.appliance_power
sensor.appliance_energy
```

The GPT should use real bounded history data and comparable periods. It should not infer total energy consumption from a single instantaneous power reading.

Another useful request is:

```text
Analyze whether the current automation schedule appears to reduce energy consumption, using the actual energy sensors and the relevant automation configuration.
```

This requires the specific sensor and automation entities to be allowed.

## Reading an automation

Example:

```text
Explain what the allowed "Good night" automation does.
```

The automation configuration endpoint is read-only and redacts common secret-bearing fields before returning the configuration.

## Running an automation

Example:

```text
Run the "Good night" automation.
```

Running an automation is a write operation and can have effects beyond its own `automation.*` entity. Treat permission to run an automation as permission for everything that automation can do.

Review the automation before adding it to a write-capable allow-list.

## Long-running automations and scripts

If asynchronous dispatch is enabled for a reviewed domain, a request such as:

```text
Run the backup automation.
```

may return `202` with a dispatch ID.

The correct user-facing interpretation is:

```text
The automation has been started/queued.
```

not:

```text
The automation has completed successfully.
```

The dispatch status can be queried later when needed.

## Home Assistant maintenance

When administration actions have been explicitly enabled and allow-listed, examples can include:

```text
Check the Home Assistant configuration.
```

```text
Reload automations.
```

```text
Restart Home Assistant.
```

These actions are disabled by default and require explicit administrator configuration.

## Areas and rooms

Example:

```text
Turn off the lights in the bedroom.
```

The GPT can use area and device discovery to understand which entities belong to the bedroom, but the final write still needs explicit allowed entity IDs.

If several possible devices match and the intended scope is unclear, the GPT should ask for clarification rather than perform a broad area-wide operation.

## Safe interaction pattern

For a state-changing request, the recommended pattern is:

```text
User request
    ↓
Resolve explicit entity
    ↓
Read current state/capabilities when needed
    ↓
Inspect live service contract when parameterized
    ↓
Call the allowed service
    ↓
Verify state when useful
    ↓
Report only what the response supports
```

## Requests that should not be broadened automatically

Be cautious with requests such as:

```text
Turn everything off.
Open all covers.
Disable the alarm.
Unlock the house.
Run every automation.
Restart everything.
```

The gateway's policy is intentionally designed to prevent natural-language ambiguity from becoming unrestricted Home Assistant control.

For exact API behavior, use the running gateway's `/openapi.json` schema and the repository's [README](https://github.com/aferende/ha-chatgpt-gateway/blob/main/README.md).