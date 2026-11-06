# H4cker Lab

A beginner-friendly cybersecurity learning app for students and anyone curious about working in the cybersecurity industry. It starts with no prior knowledge assumed and introduces core ideas through short lessons, visual examples, guided practice, and fictional challenges.

## Start learning

You need Node.js 20.19+ or 22.12+ and npm.

```sh
npm install
npm run dev
```

This starts the app and room service. Open the local address printed by Vite to use it on this computer, or the network address to let others join rooms on the same trusted local network. Learning progress and notes stay in each player's browser.

## Features

- **Choose your path:** start with the guided fundamentals path or build a custom path by selecting topics and optional library units.
- **Offensive Security Fundamentals:** eight beginner modules covering authorization and scope, networking, Linux, reconnaissance, scanning, web security, vulnerability assessment, and a final review.
- **Learning Library:** optional, reference-based study units you can add to your learning path. Each unit includes a training-material reference and a guided activity.
- **Visual examples:** simple tables that help explain network services, Linux permissions, and HTTP requests and responses.
- **Practice:** simulated labs and 30 challenges, with 10 each at Easy, Medium, and High difficulty. Challenges are tagged by topic.
- **CTF playground:** randomly generated fictional rounds for solo practice, scripted bot matches, or temporary rooms with friends on a trusted local network. Timers vary by difficulty.
- **Progress and notes:** lesson, module, lab, challenge, quiz, and library progress plus personal notes saved in browser storage.

The material is intended to build cybersecurity foundations and responsible assessment habits. It does not assume previous technical experience; technical terms are introduced in the lessons.

## Play with a room

For a room on a trusted local network, `npm run dev` is enough while developing. For a standalone classroom server, run:

```sh
npm run classroom
```

This command builds the app and starts the room server. Open the classroom address printed by the server and share the room link or code with other players on that network. Room names and scores are temporary and are cleared when the host server stops. Do not expose the classroom server to the public internet.

## Safety and privacy

All lab and CTF evidence is fictional and static. The app is not a shell, does not run commands or scanners, and does not contact real systems. No account or cloud service is required. Progress and notes stay in the current browser and do not sync to other devices. Avoid storing passwords, secrets, or sensitive personal information in notes.

## Training material references

The separate `../h4cker/` folder contains the source training materials. Lessons and library units reference relevant files there; the project keeps the training repository separate and does not execute its code or tools.

