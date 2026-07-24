# AoE II Hotkey Practice — Product Specification

## Purpose

AoE II Hotkey Practice helps players learn and reinforce hotkey sequences
without starting a game.

The product runs in a web browser. A player chooses a hotkey profile, selects a
drill and difficulty, and completes the drill using the expected hotkeys and
clicks.

## Core experience

A player can:

- use the built-in hotkey mapping or load a personal mapping;
- choose a built-in or locally saved custom drill;
- choose a difficulty;
- practise ordered hotkey and click sequences;
- see the requested command, sequence progress, time and target time;
- pause or exit a session; and
- review speed and accuracy after the session.

We use project created map and game screenshot for menu.

## Hotkey profiles

The product supports the built-in mapping and personal Age of Empires II
`.hki` and `.hkp` files.

A player may load up to two hotkey files. Each file must be no larger than
64 KiB. Files that are unsupported, invalid or too large are rejected with a
clear message.

Hotkey files are used only to resolve logical drill actions to the player's
physical keys. Drills do not store physical keys.

## Drills

A drill contains:

- a name and description;
- a session time limit; and
- one or more ordered sequences.

A sequence contains:

- a name;
- one or more ordered steps; and
- a target completion time for each difficulty.

A step is either:

- a logical hotkey action; or
- a left click.

Each step defines what happens after an incorrect hotkey:

- `wait` keeps the player on the same step; and
- `restart sequence` returns the player to the first step of that sequence.

Built-in drills are read-only. Custom drills can use any supported logical
hotkey action.

## Difficulty and timing

The difficulties are:

1. Easiest
2. Standard
3. Moderate
4. Hard
5. Hardest
6. Extreme
7. Pro

Difficulty changes the target time for a sequence. It does not change the
sequence steps.

The session ends when every sequence is completed or the drill time limit is
reached. Exceeding a sequence target time does not stop or restart the
sequence.

## Input behaviour

The product supports keyboard hotkeys, supported mouse-wheel hotkeys and left
clicks.

A left-click step succeeds when the player left-clicks anywhere on the practice
map. There are no click zones or required coordinates. Right clicks are
ignored.

Mouse input is ignored while a keyboard or mouse-wheel hotkey step is active.
Hotkey input is evaluated against the selected profile.

## Practice screen

The practice screen keeps the active sequence and its required inputs visible
with the practice surface.

It shows:

- the sequence name and progress;
- the ordered input summary;
- session time remaining;
- sequence time and target time;
- the requested command;
- contextual command-menu feedback;
- Pause; and
- Exit.

The command menu is visual feedback only. The player does not interact with it
directly.

## Results

Each evaluated hotkey or active-step left click is one try.

Results show:

- correct tries;
- total tries;
- accuracy;
- sequence completion times;
- target times; and
- whether each completed sequence met its target.

## Custom drills

Players can create, edit, delete, import and export custom drills.

The custom-drill editor supports:

- drill name, description and time limit;
- sequences and sequence names;
- ordered hotkey and left-click steps;
- failure behaviour for each step;
- optional step tips; and
- target times for every difficulty.

Custom drills are imported and exported as JSON. Invalid files are rejected
without partially saving their contents.

Custom drills are stored only in the player's browser. Built-in drills cannot
be edited, deleted or exported.

## Privacy

Hotkey files and imported drill files are processed in the browser and are not
uploaded by the application.

Only custom drills are stored persistently by the application. Hotkey files,
practice progress and session choices are not stored persistently.

The product has no user accounts or advertising. Hosting and aggregate
analytics may process ordinary technical request and performance information.

## Product boundaries

The product does not simulate game state, unit movement, construction time,
combat or resource management. It focuses on recognising and entering hotkey
sequences.

Sound feedback is outside the product scope.
