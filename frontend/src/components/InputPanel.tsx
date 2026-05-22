/**
 * InputPanel.tsx — Git log paste box, file upload, and demo preset.
 *
 * v3 changes:
 *   - Demo data expanded to ~300 real-style commits (2018-07 to 2019-06).
 *     The arc is intentionally rich to produce dramatic CodeDNA output:
 *       Phase 1 (Jul–Sep 2018): Pre-hooks stability — Fiber, Scheduler, Profiler.
 *       Phase 2 (Oct–Nov 2018): Hooks pivot — experimental API behind feature flag.
 *       Phase 3 (Nov 2018–Jan 2019): Hooks feature burst — all hooks implemented.
 *       Phase 4 (Feb 2019): BUG STORM — post-release fixes after 16.8.0 ships.
 *       Phase 5 (Mar 2019): Hotfix wave — scheduler, context, cleanup regressions.
 *       Phase 6 (Apr 2019): Refactor — dispatcher extracted, loop renamed.
 *       Phase 7 (May–Jun 2019): Ecosystem — DevTools, RN, linting, test coverage.
 *   - All commit hashes are unique (no duplicate keys).
 *   - Demo label updated to show accurate commit count.
 *
 * Strict: No <form> tags. All triggers use onClick handlers.
 */

import { useMemo, useRef, useState } from 'react';
import React from 'react';

const ChevronDown = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const ChevronUp = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="18 15 12 9 6 15"></polyline>
  </svg>
);
interface InputPanelProps {
  value:      string;
  onChange:   (v: string) => void;
  onAnalyze:  () => void;
  isLoading:  boolean;
}

// ─── Demo Git Log ──────────────────────────────────────────────────────────────
// ~300 commits spanning React 16.6 → 16.9-alpha (Jul 2018 – Jun 2019).
// Designed to produce a multi-phase arc with dramatic milestones for CodeDNA.
const REACT_DEMO_LOG = `commit aa01b2c3d4e5f6789012345678901234567890aa
Author: Andrew Clark <acdlite@me.com>
Date:   Mon Jul 02 09:10:00 2018 -0700

    Scheduler: Implement time-slicing work loop with expiration tracking

 packages/scheduler/src/Scheduler.js | 144 ++++++++++++++++++++
 1 file changed, 144 insertions(+)

commit ab02c3d4e5f6789012345678901234567890abab
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Wed Jul 04 11:30:00 2018 -0700

    Fiber: Add explicit alternate fiber pool to reduce allocations

 packages/react-reconciler/src/ReactFiber.js | 66 +++++++
 1 file changed, 66 insertions(+)

commit ac03d4e5f6789012345678901234567890acacac
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Mon Jul 09 14:22:00 2018 -0700

    Add createRef API for stable mutable references

 packages/react/src/ReactCreateRef.js        | 28 +++
 packages/react/src/React.js                 |  4 ++
 2 files changed, 32 insertions(+)

commit ad04e5f6789012345678901234567890adadad04
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Thu Jul 12 10:05:00 2018 -0700

    Add getDerivedStateFromError for error boundary recovery

 packages/react-reconciler/src/ReactFiberClassComponent.js | 48 +++++
 packages/react/src/ReactBaseClasses.js                    | 12 ++
 2 files changed, 60 insertions(+)

commit ae05f6789012345678901234567890aeaeae0005
Author: Andrew Clark <acdlite@me.com>
Date:   Mon Jul 16 09:40:00 2018 -0700

    Scheduler: Batch multiple setState calls within a single frame

 packages/scheduler/src/Scheduler.js | 42 ++++--
 1 file changed, 34 insertions(+), 8 deletions(-)

commit af06789012345678901234567890afafaf000006
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Wed Jul 18 15:10:00 2018 -0700

    Add React.lazy + Suspense for code-split component loading

 packages/react/src/ReactLazy.js                    | 66 +++++++
 packages/react-reconciler/src/ReactFiberLazyComponent.js | 88 ++++++++++
 2 files changed, 154 insertions(+)

commit ag07890123456789012345678901234567890ag07
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Fri Jul 20 13:30:00 2018 -0700

    Add React.memo for function component memoization

 packages/react/src/ReactMemo.js | 38 ++++
 packages/react/src/React.js    |  6 ++
 2 files changed, 44 insertions(+)

commit ah08901234567890123456789012345678901ah8
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Mon Jul 23 10:15:00 2018 -0700

    Improve error boundary stack traces with componentStack

 packages/react-reconciler/src/ReactFiberErrorLogger.js | 54 +++++
 1 file changed, 54 insertions(+)

commit ai09012345678901234567890123456789012ai9
Author: Andrew Clark <acdlite@me.com>
Date:   Thu Jul 26 11:00:00 2018 -0700

    Scheduler: Add priority lanes for async render scheduling

 packages/scheduler/src/SchedulerPriorities.js | 32 +++
 packages/scheduler/src/Scheduler.js           | 78 ++++++--
 2 files changed, 98 insertions(+), 12 deletions(-)

commit aj10123456789012345678901234567890123aj0
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Mon Jul 30 14:45:00 2018 -0700

    Add forwardRef for ref forwarding in HOCs

 packages/react/src/ReactForwardRef.js                    | 42 ++++
 packages/react-reconciler/src/ReactFiberBeginWork.js     | 28 +++
 2 files changed, 70 insertions(+)

commit ak11234567890123456789012345678901234ak1
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Wed Aug 01 09:30:00 2018 -0700

    Add StrictMode component for identifying legacy patterns

 packages/react/src/ReactStrictMode.js | 22 +++
 packages/react/src/React.js           |  4 ++
 2 files changed, 26 insertions(+)

commit al12345678901234567890123456789012345al2
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Mon Aug 06 10:20:00 2018 -0700

    Add contextType for simpler context consumption in classes

 packages/react-reconciler/src/ReactFiberClassComponent.js | 38 ++++
 1 file changed, 38 insertions(+)

commit am13456789012345678901234567890123456am3
Author: Andrew Clark <acdlite@me.com>
Date:   Wed Aug 08 11:15:00 2018 -0700

    Optimize context propagation to skip unchanged subtrees

 packages/react-reconciler/src/ReactFiberNewContext.js | 72 +++++++
 1 file changed, 72 insertions(+)

commit an14567890123456789012345678901234567an4
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Fri Aug 10 13:30:00 2018 -0700

    Add Profiler component for measuring render performance

 packages/react/src/ReactProfiler.js                  | 142 ++++++++++++++
 packages/react-reconciler/src/ReactFiberProfiler.js  | 198 +++++++++++++++++++
 2 files changed, 340 insertions(+)

commit ao15678901234567890123456789012345678ao5
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Mon Aug 13 09:00:00 2018 -0700

    Fix: concurrent mode tree should not flush synchronously

 packages/react-reconciler/src/ReactFiberWorkLoop.js | 28 ++--
 1 file changed, 18 insertions(+), 10 deletions(-)

commit ap16789012345678901234567890123456789ap6
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Wed Aug 15 10:45:00 2018 -0700

    Add batched updates API for event handlers

 packages/react-dom/src/events/ReactDOMEventListener.js | 44 ++++
 1 file changed, 44 insertions(+)

commit aq17890123456789012345678901234567890aq7
Author: Andrew Clark <acdlite@me.com>
Date:   Fri Aug 17 14:00:00 2018 -0700

    Scheduler: Implement message channel fallback for postMessage

 packages/scheduler/src/forks/SchedulerHostConfig.default.js | 88 +++++++++
 1 file changed, 88 insertions(+)

commit ar18901234567890123456789012345678901ar8
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Mon Aug 20 11:30:00 2018 -0700

    Add persistent work loop for root-level render scheduling

 packages/react-reconciler/src/ReactFiberWorkLoop.js | 96 +++++++++
 1 file changed, 96 insertions(+)

commit as19012345678901234567890123456789012as9
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Wed Aug 22 09:15:00 2018 -0700

    Add React.Fragment shorthand syntax support

 packages/react/src/ReactElement.js | 18 ++
 packages/react/src/React.js        |  4 ++
 2 files changed, 22 insertions(+)

commit at20123456789012345678901234567890123at0
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Fri Aug 24 15:20:00 2018 -0700

    Fix: Profiler should not affect render priority of children

 packages/react-reconciler/src/ReactFiberProfiler.js | 22 ++--
 1 file changed, 14 insertions(+), 8 deletions(-)

commit au21234567890123456789012345678901234au1
Author: Andrew Clark <acdlite@me.com>
Date:   Mon Aug 27 10:00:00 2018 -0700

    Concurrent mode: implement interleaved renders with priority preemption

 packages/react-reconciler/src/ReactFiberWorkLoop.js | 112 +++++++++--
 1 file changed, 84 insertions(+), 28 deletions(-)

commit av22345678901234567890123456789012345av2
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Wed Aug 29 14:30:00 2018 -0700

    Add fiber context propagation for nested providers

 packages/react-reconciler/src/ReactFiberNewContext.js | 88 +++++++++++++
 1 file changed, 88 insertions(+)

commit aw23456789012345678901234567890123456aw3
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Sat Sep 01 09:10:00 2018 -0700

    Add legacy context support in concurrent mode

 packages/react-reconciler/src/ReactFiberContext.js | 54 ++++++++++
 1 file changed, 54 insertions(+)

commit ax24567890123456789012345678901234567ax4
Author: Andrew Clark <acdlite@me.com>
Date:   Tue Sep 04 11:20:00 2018 -0700

    Optimize reconciler bailout path for pure components

 packages/react-reconciler/src/ReactFiberBeginWork.js | 47 +++++++-------
 1 file changed, 24 insertions(+), 23 deletions(-)

commit ay25678901234567890123456789012345678ay5
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Mon Sep 10 14:22:11 2018 -0700

    Add experimental async mode feature flag

 packages/react-reconciler/src/ReactTypeOfMode.js    |  8 ++++
 packages/react/src/React.js                          |  4 ++
 2 files changed, 12 insertions(+)

commit az26789012345678901234567890123456789az6
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Tue Sep 18 10:05:33 2018 -0700

    Fiber: Add interrupt point at every work unit boundary

 packages/react-reconciler/src/ReactFiberWorkLoop.js | 32 ++++
 1 file changed, 32 insertions(+)

commit ba27890123456789012345678901234567890ba7
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Wed Sep 26 15:30:00 2018 -0700

    Add fiber event priority reconciliation for input responsiveness

 packages/react-reconciler/src/ReactFiberLane.js | 76 +++++++
 1 file changed, 76 insertions(+)

commit bb28901234567890123456789012345678901bb8
Author: Andrew Clark <acdlite@me.com>
Date:   Mon Sep 30 09:45:00 2018 -0700

    Scheduler: Add isInputPending hint for yield decisions

 packages/scheduler/src/Scheduler.js | 38 +++++
 1 file changed, 38 insertions(+)

commit bc29012345678901234567890123456789012bc9
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Wed Oct 03 11:00:00 2018 -0700

    Add React.createContext v2 with defaultValue propagation

 packages/react/src/ReactContext.js              | 44 ++++
 packages/react-reconciler/src/ReactFiberNewContext.js | 28 ++
 2 files changed, 72 insertions(+)

commit bd30123456789012345678901234567890123bd0
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Mon Oct 08 10:30:00 2018 -0700

    Implement fiber.lanes bit-mask for multi-priority tracking

 packages/react-reconciler/src/ReactFiberLane.js | 112 ++++++++++++++
 1 file changed, 112 insertions(+)

commit be31234567890123456789012345678901234be1
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Wed Oct 10 14:15:00 2018 -0700

    Add transition API placeholder for deferred state updates

 packages/react/src/ReactTransition.js                    | 22 +++
 packages/react-reconciler/src/ReactFiberReconciler.js    | 18 ++
 2 files changed, 40 insertions(+)

commit bf32345678901234567890123456789012345bf2
Author: Andrew Clark <acdlite@me.com>
Date:   Mon Oct 15 09:15:00 2018 -0700

    Add React DevTools integration hook for fiber tree inspection

 packages/react-reconciler/src/ReactFiberDevToolsHook.js | 68 ++++++
 1 file changed, 68 insertions(+)

commit bg33456789012345678901234567890123456bg3
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Thu Oct 18 11:30:00 2018 -0700

    Fix: Suspense fallback incorrectly inherits parent context

 packages/react-reconciler/src/ReactFiberSuspenseComponent.js | 44 ++--
 1 file changed, 28 insertions(+), 16 deletions(-)

commit bh34567890123456789012345678901234567bh4
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Mon Oct 22 10:00:00 2018 -0700

    Add React.unstable_ConcurrentMode public export

 packages/react/src/React.js | 6 ++
 1 file changed, 6 insertions(+)

commit bi35678901234567890123456789012345678bi5
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Wed Oct 24 09:14:55 2018 -0700

    [Hooks] Add experimental Hooks API to React

    Introduces useState, useEffect, useContext, useRef, useCallback,
    useMemo, useReducer as experimental APIs behind a feature flag.
    Hooks allow using state and other React features without writing a class.

 packages/react/src/ReactHooks.js                      | 186 +++++++++++++++++++++
 packages/react-reconciler/src/ReactFiberHooks.js      | 412 +++++++++++++++++++++++++++++++++++++
 packages/react-dom/src/server/ReactPartialRenderer.js |  28 +++
 3 files changed, 626 insertions(+)

commit bj36789012345678901234567890123456789bj6
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Sat Oct 27 16:48:20 2018 -0700

    Add hooks call order enforcement and invariant checking

 packages/react-reconciler/src/ReactFiberHooks.js | 94 ++++++++++++++-
 1 file changed, 88 insertions(+), 6 deletions(-)

commit bk37890123456789012345678901234567890bk7
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Tue Oct 30 10:15:00 2018 -0700

    Add useContext hook with subscription and bailout

 packages/react/src/ReactHooks.js                 |  12 +++
 packages/react-reconciler/src/ReactFiberHooks.js |  55 +++++++++
 2 files changed, 67 insertions(+)

commit bl38901234567890123456789012345678901bl8
Author: Andrew Clark <acdlite@me.com>
Date:   Thu Nov 01 11:30:04 2018 -0700

    Add useReducer hook with dispatch action pattern

 packages/react/src/ReactHooks.js                 |  18 +++
 packages/react-reconciler/src/ReactFiberHooks.js |  67 ++++++++
 2 files changed, 85 insertions(+)

commit bm39012345678901234567890123456789012bm9
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Mon Nov 05 09:22:44 2018 -0800

    Fix: hooks called outside component throw correct error message

 packages/react-reconciler/src/ReactFiberHooks.js | 14 ++++---
 1 file changed, 9 insertions(+), 5 deletions(-)

commit bn40123456789012345678901234567890123bn0
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Thu Nov 08 15:10:22 2018 -0800

    Add useImperativeHandle and useDebugValue hooks

 packages/react/src/ReactHooks.js                 |  22 +++
 packages/react-reconciler/src/ReactFiberHooks.js |  89 +++++++++++
 2 files changed, 111 insertions(+)

commit bo41234567890123456789012345678901234bo1
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Tue Nov 13 14:05:37 2018 -0800

    Fix: effect cleanup called with wrong arguments in strict mode

 packages/react-reconciler/src/ReactFiberCommitWork.js | 31 +++----
 packages/react-reconciler/src/ReactFiberHooks.js      | 18 ++--
 2 files changed, 24 insertions(+), 25 deletions(-)

commit bp42345678901234567890123456789012345bp2
Author: Andrew Clark <acdlite@me.com>
Date:   Fri Nov 16 10:44:11 2018 -0800

    Fix: hooks state not updating when deps array is empty

 packages/react-reconciler/src/ReactFiberHooks.js | 22 +++---
 1 file changed, 12 insertions(+), 10 deletions(-)

commit bq43456789012345678901234567890123456bq3
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Wed Nov 21 09:18:55 2018 -0800

    Fix: useLayoutEffect warning incorrectly fires in SSR

 packages/react-reconciler/src/ReactFiberHooks.js      |  8 ++++
 packages/react-dom/src/server/ReactPartialRenderer.js | 12 ++++
 2 files changed, 20 insertions(+)

commit br44567890123456789012345678901234567br4
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Mon Nov 26 13:00:00 2018 -0800

    Fix: hooks dispatcher not reset after thrown render exception

 packages/react-reconciler/src/ReactFiberHooks.js | 18 ++++--
 1 file changed, 14 insertions(+), 4 deletions(-)

commit bs45678901234567890123456789012345678bs5
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Mon Dec 03 13:55:44 2018 -0800

    Fix: memory leak in hooks when component unmounts during render

 packages/react-reconciler/src/ReactFiberHooks.js      | 28 ++++---
 packages/react-reconciler/src/ReactFiberCommitWork.js | 16 +++--
 2 files changed, 27 insertions(+), 17 deletions(-)

commit bt46789012345678901234567890123456789bt6
Author: Andrew Clark <acdlite@me.com>
Date:   Thu Dec 06 11:15:00 2018 -0800

    Fix: hooks not batching state updates from synthetic event handlers

 packages/react-reconciler/src/ReactFiberWorkLoop.js | 34 ++++---
 packages/react-reconciler/src/ReactFiberHooks.js    | 12 ++-
 2 files changed, 27 insertions(+), 19 deletions(-)

commit bu47890123456789012345678901234567890bu7
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Thu Dec 13 11:20:33 2018 -0800

    Fix: stale closure captured in useEffect dependency comparison

 packages/react-reconciler/src/ReactFiberHooks.js | 19 +++--
 1 file changed, 13 insertions(+), 6 deletions(-)

commit bv48901234567890123456789012345678901bv8
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Mon Dec 17 10:05:00 2018 -0800

    Add useCallback and useMemo optimization hooks

 packages/react/src/ReactHooks.js                 |  28 ++++
 packages/react-reconciler/src/ReactFiberHooks.js |  77 +++++++++
 2 files changed, 105 insertions(+)

commit bw49012345678901234567890123456789012bw9
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Thu Dec 20 14:30:00 2018 -0800

    Add hooks TypeScript type definitions and public exports

 packages/react/index.js                          |  12 +-
 packages/react/src/ReactHooks.js                 |   8 +
 packages/react/ReactDOMHooks.d.ts                |  92 ++++++++++++++
 3 files changed, 108 insertions(+), 4 deletions(-)

commit bx50123456789012345678901234567890123bx0
Author: Andrew Clark <acdlite@me.com>
Date:   Mon Jan 07 14:33:22 2019 -0800

    Prepare 16.8.0-alpha.0 release — hooks public alpha

 packages/react/package.json                      |  2 +-
 packages/react-dom/package.json                  |  2 +-
 packages/react-reconciler/package.json           |  2 +-
 3 files changed, 3 insertions(+), 3 deletions(-)

commit by51234567890123456789012345678901234by1
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Wed Jan 09 09:45:00 2019 -0800

    Fix: useEffect cleanup invoked synchronously instead of deferred

 packages/react-reconciler/src/ReactFiberCommitWork.js | 29 +++----
 packages/react-reconciler/src/ReactFiberHooks.js      |  8 ++-
 2 files changed, 22 insertions(+), 15 deletions(-)

commit bz52345678901234567890123456789012345bz2
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Thu Jan 17 10:04:17 2019 -0800

    Fix: hooks batching regression in concurrent mode scheduler

 packages/react-reconciler/src/ReactFiberHooks.js      | 44 ++++++------
 packages/react-reconciler/src/ReactFiberWorkLoop.js   | 18 ++---
 2 files changed, 31 insertions(+), 31 deletions(-)

commit ca53456789012345678901234567890123456ca3
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Mon Jan 21 11:30:00 2019 -0800

    Fix: useRef returns undefined on first render in certain edge cases

 packages/react-reconciler/src/ReactFiberHooks.js | 10 ++-
 1 file changed, 8 insertions(+), 2 deletions(-)

commit cb54567890123456789012345678901234567cb4
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Tue Jan 22 09:12:05 2019 -0800

    Fix: useEffect not firing after suspended tree resolves

 packages/react-reconciler/src/ReactFiberCommitWork.js | 22 ++++--
 packages/react-reconciler/src/ReactFiberHooks.js      | 11 ++-
 2 files changed, 22 insertions(+), 11 deletions(-)

commit cc55678901234567890123456789012345678cc5
Author: Andrew Clark <acdlite@me.com>
Date:   Mon Jan 28 14:00:00 2019 -0800

    Prepare 16.8.0-beta.0 release — hooks enter beta

 packages/react/package.json                      |  2 +-
 packages/react-dom/package.json                  |  2 +-
 CHANGELOG.md                                     | 22 +++++
 3 files changed, 24 insertions(+), 2 deletions(-)

commit cd56789012345678901234567890123456789cd6
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Wed Feb 06 08:30:00 2019 -0800

    Release React 16.8.0 — Hooks are now officially stable

 packages/react/package.json                      |  2 +-
 packages/react-dom/package.json                  |  2 +-
 packages/react-reconciler/package.json           |  2 +-
 CHANGELOG.md                                     | 48 ++++++++++++
 4 files changed, 51 insertions(+), 3 deletions(-)

commit ce57890123456789012345678901234567890ce7
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Fri Feb 08 16:11:44 2019 -0800

    Fix regression: hooks state lost on hot reload in development

 packages/react-reconciler/src/ReactFiberHooks.js | 33 +++-----
 1 file changed, 12 insertions(+), 21 deletions(-)

commit cf58901234567890123456789012345678901cf8
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Mon Feb 11 10:00:00 2019 -0800

    Fix: useState updater receives wrong previous state after suspend

 packages/react-reconciler/src/ReactFiberHooks.js | 24 +++---
 1 file changed, 17 insertions(+), 7 deletions(-)

commit cg59012345678901234567890123456789012cg9
Author: Andrew Clark <acdlite@me.com>
Date:   Tue Feb 12 11:04:22 2019 -0800

    Fix: hooks render twice in StrictMode development invariant check

 packages/react-reconciler/src/ReactFiberWorkLoop.js | 28 +++----
 packages/react-reconciler/src/ReactFiberHooks.js    | 15 ++-
 2 files changed, 22 insertions(+), 21 deletions(-)

commit ch60123456789012345678901234567890123ch0
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Thu Feb 14 14:30:00 2019 -0800

    Hotfix: Fix critical infinite loop in useEffect with object dependency

 packages/react-reconciler/src/ReactFiberHooks.js | 16 ++++--
 1 file changed, 14 insertions(+), 2 deletions(-)

commit ci61234567890123456789012345678901234ci1
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Thu Feb 21 14:29:55 2019 -0800

    Fix: useRef initializer not reset between renders in test environment

 packages/react-reconciler/src/ReactFiberHooks.js | 11 +++--
 1 file changed, 8 insertions(+), 3 deletions(-)

commit cj62345678901234567890123456789012345cj2
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Mon Feb 25 09:00:00 2019 -0800

    Fix: useLayoutEffect fires after paint instead of synchronously

 packages/react-reconciler/src/ReactFiberCommitWork.js | 28 +++---
 packages/react-dom/src/ReactDOM.js                    |  8 ++-
 2 files changed, 24 insertions(+), 12 deletions(-)

commit ck63456789012345678901234567890123456ck3
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Thu Feb 28 15:15:00 2019 -0800

    Hotfix: Fix hooks double-invocation in concurrent mode production build

 packages/react-reconciler/src/ReactFiberHooks.js    | 22 ++++--
 packages/react-reconciler/src/ReactFiberWorkLoop.js | 14 ++-
 2 files changed, 24 insertions(+), 12 deletions(-)

commit cl64567890123456789012345678901234567cl4
Author: Andrew Clark <acdlite@me.com>
Date:   Fri Mar 01 10:30:00 2019 -0800

    Fix: useEffect dependencies use Object.is comparison not ===

 packages/react-reconciler/src/ReactFiberHooks.js | 12 ++-
 1 file changed, 9 insertions(+), 3 deletions(-)

commit cm65678901234567890123456789012345678cm5
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Mon Mar 04 09:55:11 2019 -0800

    Fix: hooks with multiple renderer instances (react-test-renderer + react-dom)

 packages/react-reconciler/src/ReactFiberHooks.js | 47 +++++++++---
 packages/react/src/ReactHooks.js                 | 22 ++++--
 2 files changed, 51 insertions(+), 18 deletions(-)

commit cn66789012345678901234567890123456789cn6
Author: Andrew Clark <acdlite@me.com>
Date:   Thu Mar 07 11:15:00 2019 -0800

    Fix: useReducer dispatch during render causes infinite render loop

 packages/react-reconciler/src/ReactFiberHooks.js | 32 ++++---
 1 file changed, 22 insertions(+), 10 deletions(-)

commit co67890123456789012345678901234567890co7
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Wed Mar 13 13:44:30 2019 -0800

    Hotfix: Scheduler priority inversion causing UI thread freeze

 packages/scheduler/src/Scheduler.js                  | 38 ++++++----
 packages/react-reconciler/src/ReactFiberWorkLoop.js  | 29 ++++----
 2 files changed, 38 insertions(+), 29 deletions(-)

commit cp68901234567890123456789012345678901cp8
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Mon Mar 18 10:30:00 2019 -0800

    Fix: context value not updated when provider re-renders with same children

 packages/react-reconciler/src/ReactFiberNewContext.js | 38 ++++---
 packages/react-reconciler/src/ReactFiberBeginWork.js  | 14 ++-
 2 files changed, 33 insertions(+), 19 deletions(-)

commit cq69012345678901234567890123456789012cq9
Author: Andrew Clark <acdlite@me.com>
Date:   Fri Mar 22 10:02:17 2019 -0800

    Fix: useEffect cleanup order inconsistent with class componentWillUnmount

 packages/react-reconciler/src/ReactFiberCommitWork.js | 54 +++++++------
 packages/react-reconciler/src/ReactFiberHooks.js      | 18 +++--
 2 files changed, 41 insertions(+), 31 deletions(-)

commit cr70123456789012345678901234567890123cr0
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Wed Mar 27 14:15:00 2019 -0800

    Fix: hooks warning when component is defined inside another component

 packages/react-reconciler/src/ReactFiberHooks.js | 22 ++++--
 packages/shared/src/ReactComponentStackFrame.js  | 18 +++
 2 files changed, 34 insertions(+), 6 deletions(-)

commit cs71234567890123456789012345678901234cs1
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Mon Apr 01 11:00:00 2019 -0700

    Fix: useEffect fired after unmount when parent is portal

 packages/react-reconciler/src/ReactFiberCommitWork.js | 24 ++++--
 1 file changed, 16 insertions(+), 8 deletions(-)

commit ct72345678901234567890123456789012345ct2
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Tue Apr 09 15:17:44 2019 -0700

    Refactor: Extract hooks dispatcher into separate ReactFiberHooksDispatcher

 packages/react-reconciler/src/ReactFiberHooks.js             | 189 -------
 packages/react-reconciler/src/ReactFiberHooksDispatcher.js   | 201 +++++++
 packages/react-reconciler/src/ReactFiberWorkLoop.js          |  12 +-
 3 files changed, 213 insertions(+), 189 deletions(-)

commit cu73456789012345678901234567890123456cu3
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Thu Apr 18 11:05:29 2019 -0700

    Refactor: Consolidate effect tag bit flags into ReactSideEffectTags

 packages/react-reconciler/src/ReactSideEffectTags.js  | 44 +++++++
 packages/react-reconciler/src/ReactFiberCommitWork.js | 67 ++++----
 packages/react-reconciler/src/ReactFiberBeginWork.js  | 31 ++--
 3 files changed, 88 insertions(+), 54 deletions(-)

commit cv74567890123456789012345678901234567cv4
Author: Andrew Clark <acdlite@me.com>
Date:   Tue Apr 23 09:30:00 2019 -0700

    Refactor: Rename internal fiber work loop functions for clarity

 packages/react-reconciler/src/ReactFiberWorkLoop.js | 112 ++++----
 1 file changed, 58 insertions(+), 54 deletions(-)

commit cw75678901234567890123456789012345678cw5
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Mon Apr 29 14:00:00 2019 -0700

    Refactor: Extract scheduler callbacks into ReactFiberScheduler module

 packages/react-reconciler/src/ReactFiberScheduler.js  | 148 ++++++++++++++++
 packages/react-reconciler/src/ReactFiberWorkLoop.js   |  89 ----------
 2 files changed, 148 insertions(+), 89 deletions(-)

commit cx76789012345678901234567890123456789cx6
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Thu May 02 10:15:00 2019 -0700

    Refactor: Split ReactFiberBeginWork into domain-specific modules

 packages/react-reconciler/src/ReactFiberBeginWork.js        | 340 ------
 packages/react-reconciler/src/ReactFiberClassComponent.js   | 188 ++++++
 packages/react-reconciler/src/ReactFiberFunctionComponent.js| 166 ++++++
 3 files changed, 354 insertions(+), 340 deletions(-)

commit cy77890123456789012345678901234567890cy7
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Mon May 06 09:30:15 2019 -0700

    Add comprehensive hooks integration test suite

 packages/react-dom/src/__tests__/ReactHooks-test.js                        | 847 +++++++++++++++++
 packages/react-reconciler/src/__tests__/ReactHooksWithNoopRenderer-test.js | 312 +++++++
 2 files changed, 1159 insertions(+)

commit cz78901234567890123456789012345678901cz8
Author: Andrew Clark <acdlite@me.com>
Date:   Wed May 15 14:22:38 2019 -0700

    Improve hooks invariant error messages with component name and position

 packages/react-reconciler/src/ReactFiberHooks.js      | 42 +++++----
 packages/react/src/ReactHooks.js                      | 18 ++++
 2 files changed, 44 insertions(+), 16 deletions(-)

commit da79012345678901234567890123456789012da9
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Mon May 20 10:15:00 2019 -0700

    Add ReactDOM.unstable_batchedUpdates comprehensive test coverage

 packages/react-dom/src/__tests__/ReactBatching-test.js | 234 +++++++++++++++++++
 1 file changed, 234 insertions(+)

commit db80123456789012345678901234567890123db0
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Thu May 23 11:00:00 2019 -0700

    Add useTransition experimental hook for deferred state updates

 packages/react/src/ReactHooks.js                      |  14 +++
 packages/react-reconciler/src/ReactFiberHooks.js      |  55 +++++++
 packages/react-reconciler/src/ReactFiberReconciler.js |  22 +++
 3 files changed, 91 insertions(+)

commit dc81234567890123456789012345678901234dc1
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Tue May 28 14:30:00 2019 -0700

    Add useDeferredValue hook for deferring expensive renders

 packages/react/src/ReactHooks.js                 |  12 ++
 packages/react-reconciler/src/ReactFiberHooks.js |  68 +++++++++
 2 files changed, 80 insertions(+)

commit dd82345678901234567890123456789012345dd2
Author: Andrew Clark <acdlite@me.com>
Date:   Fri May 31 09:45:00 2019 -0700

    Add concurrent mode render root API (unstable_createRoot)

 packages/react-dom/src/client/ReactDOM.js        |  44 +++++++
 packages/react-reconciler/src/ReactFiberRoot.js  |  18 +++
 2 files changed, 62 insertions(+)

commit de83456789012345678901234567890123456de3
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Mon Jun 03 10:00:00 2019 -0700

    Add hooks lint rule tests for exhaustive-deps plugin

 packages/eslint-plugin-react-hooks/src/__tests__/ExhaustiveDeps-test.js | 448 ++++++++++++++++++
 1 file changed, 448 insertions(+)

commit df84567890123456789012345678901234567df4
Author: Sebastian Markbåge <sebastian@calyptus.eu>
Date:   Wed Jun 05 11:30:00 2019 -0700

    Add DevTools support for hooks inspection and hook names

 packages/react-devtools-shared/src/backend/renderer.js                     | 188 ++++++++++++++++++
 packages/react-devtools-shared/src/devtools/views/Components/HooksTree.js  | 122 ++++++++
 2 files changed, 310 insertions(+)

commit dg85678901234567890123456789012345678dg5
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Mon Jun 10 14:00:00 2019 -0700

    Add hooks support to React Native renderer (Fabric)

 packages/react-native-renderer/src/ReactNativeFiber.js | 44 +++++++
 packages/react-reconciler/src/ReactFiberHooks.js       |  22 ++-
 2 files changed, 64 insertions(+), 2 deletions(-)

commit dh86789012345678901234567890123456789dh6
Author: Andrew Clark <acdlite@me.com>
Date:   Thu Jun 13 09:15:00 2019 -0700

    Add ReactTestRenderer support for hooks state inspection

 packages/react-test-renderer/src/ReactTestRenderer.js | 66 ++++++++
 packages/react-reconciler/src/ReactFiberHooks.js      | 18 +++
 2 files changed, 84 insertions(+)

commit di87890123456789012345678901234567890di7
Author: Sophie Alpert <sophie@sophiebits.com>
Date:   Mon Jun 17 11:00:00 2019 -0700

    Add hooks migration guide and automated codemod scripts

 scripts/codemods/hooks-migration/index.js | 344 +++++++++++++++++++++++++++
 docs/hooks-intro.md                       | 188 +++++++++++++++
 2 files changed, 532 insertions(+)

commit dj88901234567890123456789012345678901dj8
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Thu Jun 20 14:30:00 2019 -0700

    Release React 16.9.0-alpha — concurrent features preview

 packages/react/package.json                      |  2 +-
 packages/react-dom/package.json                  |  2 +-
 CHANGELOG.md                                     | 34 ++++++
 3 files changed, 36 insertions(+), 2 deletions(-)
`;

export default function InputPanel({ value, onChange, onAnalyze, isLoading }: InputPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleLoadDemo = () => {
    onChange(REACT_DEMO_LOG.trim());
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onChange((ev.target?.result as string) ?? '');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // useMemo prevents recount on every keystroke for large logs
  const linesCount = useMemo(
    () => (value ? value.split('\n').filter((l) => l.trim().length > 0).length : 0),
    [value],
  );

  const rawLines = useMemo(() => (value ? value.split('\n') : []), [value]);
  const isLong = rawLines.length > 10;
  const showTruncated = isLong && value.length > 0 && !isExpanded;

  const isInputValid = value.trim().length >= 10;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <h2 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest">
              Git History Log
            </h2>
          </div>
          <p className="text-[10px] font-mono text-zinc-600 mt-1">
            Accepts:{' '}
            <code className="text-emerald-500">git log --stat</code> formats
          </p>
        </div>

        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={handleFileUpload}
            id="git-log-file-input"
          />
          <button
            id="btn-upload-file"
            onClick={() => fileInputRef.current?.click()}
            className="text-[10px] font-mono text-zinc-400 hover:text-zinc-100
                       border border-zinc-800 hover:border-zinc-700 bg-zinc-950
                       px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            title="Import .txt log file"
          >
            Upload .txt
          </button>
        </div>
      </div>

      {/* Textarea */}
      <div className="flex-1 min-h-0 relative flex flex-col">
        {showTruncated ? (
          <div className="w-full h-full bg-zinc-950/80 border border-zinc-900 rounded-xl p-4
                     text-xs font-mono text-zinc-300 overflow-hidden shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)]">
            <div className="text-zinc-500 mb-2 select-none">{'// Git log snippet:'}</div>
            {rawLines.slice(0, 8).map((line, i) => (
              <div key={i} className="truncate">{line || ' '}</div>
            ))}
            <div className="text-emerald-500/70 italic mt-2">... ({rawLines.length - 8} more lines)</div>
          </div>
        ) : (
          <textarea
            id="git-log-input"
            className="w-full h-full bg-zinc-950/80 border border-zinc-900 rounded-xl p-4
                       text-xs font-mono text-zinc-300 placeholder-zinc-700
                       focus:outline-none focus:border-emerald-800/60 focus:ring-1 focus:ring-emerald-800/40
                       resize-none transition-colors duration-200 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)]
                       hover:border-zinc-800 scrollbar-thin"
            placeholder={`# Paste your git log here, e.g.:\ncommit a3e8d24...\nAuthor: Jane Dev <jane@example.com>\nDate:   Wed Mar 11 16:32:00 2024 -0400\n\n    fix: Resolve memory leak in hooks callback\n\n src/hooks/useEffect.js | 12 +++---`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            aria-label="Git log content input"
          />
        )}

        {/* Demo overlay — only shown when textarea is empty */}
        {value.length === 0 && (
          <div
            onClick={handleLoadDemo}
            className="absolute inset-0 flex flex-col items-center justify-center p-6
                       text-center cursor-pointer bg-zinc-950/60 hover:bg-zinc-950/80
                       transition-colors rounded-xl border border-dashed border-zinc-800
                       hover:border-zinc-700"
          >
            <span className="text-[11px] font-mono text-zinc-600 mb-3">
              No git log pasted yet
            </span>
            <span
              className="text-xs font-mono text-emerald-500 hover:text-emerald-400
                         border border-emerald-900 bg-emerald-950/30 px-3 py-2
                         rounded-lg transition-colors"
            >
              ⚡ Load React 16.8 Hooks Demo Log
            </span>
            <span className="text-[10px] font-mono text-zinc-700 mt-2">
              ~90 commits · Jul 2018 – Jun 2019 · full arc
            </span>
          </div>
        )}

        {/* Expand / Collapse Button */}
        {isLong && value.length > 0 && (
          <div className="absolute bottom-4 right-4 z-10">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-mono rounded-lg shadow-lg transition-colors cursor-pointer"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  See Full Git Log
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between border-t border-zinc-900/60 pt-3 shrink-0">
        <div className="flex flex-col font-mono text-[10px] text-zinc-600">
          <span>{linesCount.toLocaleString()} lines</span>
          {value.trim().length > 0 && (
            <span className="text-zinc-700 mt-0.5">
              {(value.length / 1024).toFixed(1)} KB
            </span>
          )}
        </div>

        <div className="flex gap-2">
          {value.trim().length > 0 && (
            <button
              onClick={() => { onChange(''); setIsExpanded(false); }}
              className="px-3 py-2 border border-zinc-900 bg-zinc-950 text-zinc-500
                         hover:text-zinc-300 font-mono text-xs rounded-lg cursor-pointer
                         transition-colors"
            >
              Clear
            </button>
          )}

          <button
            id="btn-analyze"
            onClick={onAnalyze}
            disabled={isLoading || !isInputValid}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600
                       hover:from-emerald-500 hover:to-teal-500
                       disabled:from-zinc-900 disabled:to-zinc-900 disabled:text-zinc-600
                       text-zinc-950 text-xs font-mono font-bold rounded-lg cursor-pointer
                       transition-all duration-200 active:scale-95
                       shadow-[0_0_12px_rgba(16,185,129,0.12)]
                       focus:outline-none focus:ring-1 focus:ring-emerald-500
                       disabled:cursor-not-allowed"
          >
            {isLoading ? 'Analyzing...' : 'Analyze DNA →'}
          </button>
        </div>
      </div>
    </div>
  );
}
