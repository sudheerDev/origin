![origin_github_banner](https://user-images.githubusercontent.com/673455/37314301-f8db9a90-2618-11e8-8fee-b44f38febf38.png)

Head to https://www.originprotocol.com/developers to learn more about what we're building and how to get involved.

# Origin Box

Origin Box is a [Docker](https://www.docker.com/) container setup for running all core Origin components together in a single environment, preconfigured to work together.

Origin Box currently supports the following components:
- [origin-dapp](https://github.com/OriginProtocol/origin-dapp)
- [origin-js](https://github.com/OriginProtocol/origin-js)
- [origin-bridge](https://github.com/originprotocol/origin-bridge)
- [origin-website](https://github.com/originprotocol/origin-website)

Each repo is symlinked from the container to a local directory. You may edit the source code using your favorite editor. The repo directories just normal git repositories, so you can treat them as you would any other git repository. You can make changes, commit them, and change branches—and the container will be automatically kept in sync.

Note that origin-box supports two separate development stacks: One is the standard Origin Protocol stack consisting of origin-js, origin-bridge, and origin-dapp repositories, and the other is the the Origin website (https://originprotocol.com) stack consisting of the origin-website repository.

## Use Cases

Origin Box has several intended use cases:
- Demonstration: We want to make it as easy as possible for people to spin up their own Origin environment, emphasizing that this platform is truly open and decentralized.
- Development: While we do our best to keep our components as independent as possible, ultimately they are all designed to function together as one unit. For development we do try to stub external components as much as possible, but this has its practical limits. It is often beneficial to be able to do development in an environment where all of the components are running. It can be tricky to get all of the various components synchronized on your local machine. Origin Box manages this complexity.
- End-to-end Testing: Currently we do not have any automated end-to-end tests. We rely heavily on manual testing. Having one environment where all of our components are running together will hopefully make it easier for us to set up end-to-end testing when we are ready to do that.

## System Requirements

- Docker **version 18 or greater**:
`docker --version`
- Git:
`git --version`
- Unix-based system (OSX or Linux) needed to run the bash scripts

## Getting started

1. Clone this repository

2. Run `./install.sh -e origin` for the standard stack, or `./install.sh -e origin-website` for the website stack.

The install script will clone the origin repositories into subdirectories and checkout the develop branch. You can then develop and use them as normal git repositories. If the install script doesn't complete the most likely reason is you don't have the [required ports](#port-errors) open.

![install.sh](https://raw.githubusercontent.com/OriginProtocol/origin-box/master/screenshot.png)

## Configuration

Configuration files reside in the `envfiles` directory. They are mounted into the relevant docker container when it is started. Modifications to these files will require a container restart (if the container was running). The configuration should work out of the box. Certain components may require additional API keys for certain things to work. For example, origin-bridge needs some API keys for attestation services to work.

## Usage

Management of the containers is handled by [docker-compose](https://docs.docker.com/compose/). There are three docker-compose files included:

- `docker-compose.yml` runs the standard stack
- `docker-compose-test.yml` runs tests for the standard stack
- `docker-compose-web.yml` runs the website stack

To bring up/down the standard stack use 
```
docker-compose up
docker-compose down
```

To bring up/down the website stack you need to pass the docker-compose file explicitly: 

```
docker-compose -f docker-compose-web.yml up 
docker-compose -f docker-compose-web.yml down
```

### Handy commands

Spawn a shell (command line) in a container:

	docker exec -ti <container_name> /bin/bash

Restart DApp (needed after changing branches):

	docker-compose restart origin-dapp

Connect to the origin_bridge postgresql database:

	docker exec -ti postgres /bin/bash -c "psql -h localhost -U origin origin_bridge"

Connect to redis:

	docker exec -ti redis /bin/bash -c "redis-cli"

### Performing database migrations

Database migrations are not run automatically. To create a migration:

	docker exec -ti origin-bridge /bin/bash -c "flask db migrate"

and to upgrade versions:

	docker exec -ti origin-bridge /bin/bash -c "flask db upgrade"

### Package management

Packages are installed during the Docker build process. If you modify the packages for a project (i.e. anything that results in a change to package.json or requirements.txt) you may need to add any missing packages to the container. The best way to do this is to rebuild the container.

E.g. to rebuild the origin-js container:

	docker-compose build --no-cache origin-js

### Data persistence

PostgreSQL data will persist through bringing the containers down and up again through the use of a mounted volume. To disable this comment out the volume lines in docker-compose.yml under the `postgres` service. No persistence is in place for Redis data.

## Running tests

Test configurations are included in `docker-compose-test.yml`. To test run tests for origin-js then use:

	docker-compose -f docker-compose-test.yml up origin-js-test

and similarly for origin-bridge:

	docker-compose -f docker-compose-test.yml up origin-bridge-test

## Troubleshooting

### Packages not found

There is a known issue with `docker-compose`. [Temporary workaround instructions are in this issue](https://github.com/OriginProtocol/origin-box/issues/34).

To remove all docker containers and volumes and start from scratch:

1. `docker-compose down`
2. `docker system prune -a`
3. `docker volume prune`
4. `./install.sh -e origin`

### Port errors

The environment requires a number of ports to be free on your machine (3000, 5000, 5002, 8080, 8081 and 8545). If one of these ports isn't available spinning up the development environment may fail.

### Metamask errors

Sometimes Metamask gets confused on private networks. If you see errors generated by Metamask in your console while developing then clicking `Settings`→`Reset Account` in Metamask should resolve the issue.
