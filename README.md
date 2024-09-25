# Ephemeral Counter UI

This is a React-based UI for the Ephemeral Counter program, which is part of the documentation for integrating with the Ephemeral Rollups.

## Overview

The UI demonstrates the use of Solana's ephemeral rollups with a simple counter program. It showcases an `increment` instruction that can run both on the main network and ephemeral rollup.

## Documentation

For more information, visit: [Ephemeral Rollups Documentation](https://docs.magiblock.gg/Accelerate/ephemeral_rollups).

## Getting Started

### Prerequisites

- Node.js
- npm

### Installation

1. Navigate to the `app` directory
2. Install the dependencies:

   
   npm install
   

### Running the Application

To start the application, run:


    npm run start


### Set a custom RPC endpoint

To set a custom RPC endpoint, you can use the `REACT_APP_MAGICBLOCK_URL` environment variable. For example for running locally:

    REACT_APP_MAGICBLOCK_URL=http://localhost:8899 npm run start

