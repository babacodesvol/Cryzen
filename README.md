# FixTrack

Report campus problems. Watch them get fixed.

FixTrack is a website where students report campus issues (broken lights, leaking taps, dead Wi-Fi) with a photo and a location. Admins see which problems are most important and where they happen most, so they can fix the root cause.

Built by Cryzen.

## Features

Students

- Sign up and log in with a college email
- Report an issue with a photo, description, category and location
- Track status: Reported, Under process, Solved
- Step-by-step guide on how to report, plus a Drive link for help
- Edit profile (the admin approves the changes)

Admin

- Reports sorted by priority (more similar open reports = higher priority)
- Dashboard showing which category and area have the most problems
- Browse reports by category and status
- Update status, delete false reports, ban users
- Approve or reject profile changes

Automatic

- Student accounts are deleted after the 8th semester

## Tech used

HTML, CSS, JavaScript, Node.js, Express, SQLite

## How to run

1. Install Node.js (version 18 or higher)
2. Open a terminal in the project folder and run:

npm install
npm start

3. Open http://localhost:3000

## Demo accounts

| Student | student@college.edu | student123 |
| Admin | admin@college.edu | admin123 |

## Project files

- server.js - server and API
- database.js - database setup
- index.html - page layout
- script.js - app logic
- style.css - design
