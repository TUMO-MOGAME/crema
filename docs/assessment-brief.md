# XPL Full-stack developer bootcamp assessment

The brief as supplied, preserved unchanged so the delivered work can be checked
against it. It was moved here from `README.md` so the repository's front door
describes the project rather than the assignment.

---

## Introduction

You’re opening a hipster ☕️micro-roastery and need a tiny app to log each brew
you make.

## Your mission

Ship a working full-stack **Coffee Brew Log app** that lets a user:

- Create a brew entry and save it to the database
- Read the brew log in a list view
- Filter the list view by brew method
- Edit and update a brew entry
- Delete a brew entry

## Tech stack

You may choose which technology you use, but you must include:

- A front-end framework like React, Vue, Svelte or Angular
- Any CSS framework
- A back-end framework like Node/Express, Rails, Flask, Go, Laravel etc.
- An ORM backed by a SQL database like MySQL, PostgreSQL or SQLite
- In your git repo, place your backend and frontend in their respective folders

## Technical requirements

### Front-end

- Split your app into sensible components.
- Build the UI according to the wireframe images supplied below, but feel free
  to make your own design decisions if you think of something better.
- Make sure that your UI is responsive.
- The title of the page should be “Brews: {brewCount}” where brewCount is the
  number of brews.
- Include validation: your brew create and brew edit forms should not allow the
  form to be submitted if there are blank fields.

### Back-end

- Your front-end should communicate with your back-end via a JSON API, that
  exposes CRUD endpoints for /api/brews.
- Validate that all fields are supplied before saving a record.
- Return the correct HTTP status codes as appropriate.

### Documentation and collaboration

- Include a file Documentation.md with setup instructions and a description of
  the project.
- Keep your git history tidy and commit each feature with a descriptive commit
  message.

### Security hygiene

- Don’t hardcode any secrets. You must read from ENV vars where relevant, and
  include a .env.example file for easy setup.

### Deployment

- Deploy your app using any hosting service you want, and include the URL in a
  file “deployment.md” in your repo. If you aren’t sure which host to use,
  [render.com](http://render.com) has a free tier you can use.
- If you struggle with deployment, add some notes to “deployment.md” including
  what you tried to troubleshoot and solve it.

## Wireframes

![List view](./wireframes/list-view.png)

![Add and edit](./wireframes/add-and-edit.png)
