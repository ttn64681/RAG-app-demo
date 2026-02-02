/**
 * Script to initialize portfolio data in Redis
 * `npx tsx scripts/initialize.ts`
 * Or: `npm run initialize` (if added to package.json)
 */

import { portfolioDocuments } from '../src/data/portfolio';
import { initializePortfolioData } from '../src/lib/vector-store';

async function main() {
  try {
    console.log('Initializing portfolio data...');
    await initializePortfolioData(portfolioDocuments);
    console.log(`Successfully initialized ${portfolioDocuments.length} portfolio documents!`);
    process.exit(0);
  } catch (error) {
    console.error('Error initializing portfolio data:', error);
    process.exit(1);
  }
}

main();
