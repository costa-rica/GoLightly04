# Requirements

We are going to conver the suite of GoLightly02 applications into a monorepo. This project will serve as the monorepo.

It will inlcude 3 subprojects and a database package. The engineers buidling the GoLightly03 monorepo will use the existing code for the GoLightly02 suite of applications and services to absorbe into this monorepo.

The three subprojects will be the following:

- web: absorbed from /Users/nick/Documents/GoLightly02NextJs
- api: absorbed from /Users/nick/Documents/GoLightly02API
- worker-node: absorbed from /Users/nick/Documents/GoLightly02Queuer

The database package is:

- db-models: absorbed from /Users/nick/Documents/GoLightly02Db
  - where db-models will be imported by api and worker-node

## worker-node

The worker-node project was formerly the GoLightly02Queuer. It is an ExpressJS API application that queues jobs sent by the api. This version of the service will absorb what were previously microservice: /Users/nick/Documents/AudioFileConcatenator01 and /Users/nick/Documents/RequesterElevenLabs01. The absorbed services will be part of a flow that will create meditaion .mp3 files.

Ideally, worker-node will have one endpoint file
the absorbed servcies will have their own independent endpoints for testing individual processes. But the

Since the

## Codebase

All subprojects should use an src/ directory to store the codebase.

## Testing

Use the docs/requirements/TEST_IMPLEMENTATION_NODE.md guidance to implement tests. If the absorbed GoLightly02 or microservice already uses a test that follows this guidance, then just use the same tests from that project adjusted to fit this new monorepo structure. Otherwise, bring this up as a concern during the assessment phase.

## Logging

Use the docs/requirements/LOGGING_NODE_JS_V07.md guidance to implement logging. If the absorbed GoLightly02 or microservice already uses a logging flow that follows this guidance, then just use the same logging flow from that project adjusted to fit this new monorepo structure. Otherwise, bring this up as a concern during the assessment phase.

## Assessment

The first task for this agent / engineer working on this project is to review the code in the projects to be absorbed by this repo and assess a feasiblity and overall process.

It might be necessary to do this work in stages. The agent / engineer assessing these projects should determine the best approach for implementing this new monorepo.

The projects to be absorbed will be:

- web: absorbed from /Users/nick/Documents/GoLightly02NextJs
- api: absorbed from /Users/nick/Documents/GoLightly02API
- worker-node: absorbed from /Users/nick/Documents/GoLightly02Queuer
  - including the /Users/nick/Documents/RequesterElevenLabs01 and /Users/nick/Documents/AudioFileConcatenator01 projects
- db-models: absorbed from /Users/nick/Documents/GoLightly02Db

The first stage should be to assess the absorbption of the web (/Users/nick/Documents/GoLightly02NextJs), api (/Users/nick/Documents/GoLightly02API) and db-models (/Users/nick/Documents/GoLightly02Db) projects.

The next stage would be to assess the aborption of the
