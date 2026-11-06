# Future Local Lab Integration Plan

This is a deferred design note. The current application remains simulated and has no controller, VM integration, or real tool execution.

## Proposed boundary

The React application should request a predefined exercise action from a small local controller. The controller, running beside an isolated Parrot OS VM, validates the exercise ID and configured lab target, runs only an allowlisted operation, and returns structured output. It must never accept arbitrary commands from the browser.

## Before implementation

1. Document the local VM and intentionally vulnerable target requirements.
2. Design explicit target and action allowlists, defaulting to the isolated lab network.
3. Add controller-side validation, timeouts, resource limits, stop/reset controls, and activity logs that exclude secrets.
4. Require explicit local setup and consent before starting a lab.
5. Verify isolation and ensure public or third-party targets cannot be selected.

React cannot execute Parrot OS commands directly. Any future tool must run outside the browser through the controlled local service. Do not start this phase until the simulated application has been reviewed and tested.
