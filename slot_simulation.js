const fs = require('fs');
const path = require('path');

// Configuration Objects
let symbols = {};
let reels = [];
let freeSpinsReels = [];
let paylinesConfig = [];
let payoutsConfig = {};

// Statistics Variables
let baseGameStats = {
  totalBet: 0,
  totalPayout: 0,
  spins: 0,
  payoutFrequencies: {}
};

let freeSpinStats = {
  totalPayout: 0,
  spins: 0,
  payoutFrequencies: {}
};

let isInFreeSpins = false;

// Load configuration files
function loadConfigurations() {
  try {
    // Load symbols
    symbols = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/symbols.json'), 'utf-8'));
    
    // Load reels
    reels = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/reels.json'), 'utf-8'));
    
    // Load free spins reels
    freeSpinsReels = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/freespins-reels.json'), 'utf-8'));
    
    // Load paylines
    paylinesConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/paylines.json'), 'utf-8'));
    
    // Load payouts
    payoutsConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/payouts.json'), 'utf-8'));
    
  } catch (error) {
    console.error('Error loading configuration files:', error);
    process.exit(1);
  }
}

// Function to spin reels and get matrix
function spinReelsMatrix() {
  const currentReels = isInFreeSpins ? freeSpinsReels : reels;
  const matrix = [[], [], []];

  currentReels.forEach((reel) => {
    const reelLength = reel.length;
    const spinStart = Math.floor(Math.random() * reelLength);

    for (let row = 0; row < 3; row++) {
      const symbolIndex = (spinStart + row) % reelLength;
      matrix[row].push(reel[symbolIndex]);
    }
  });

  return matrix;
}

// Get payline symbols from matrix
function getPaylineSymbols(matrix) {
  return paylinesConfig.map(payline => {
    return payline.positions.map((position, reelIndex) => {
      return matrix[position][reelIndex];
    });
  });
}

// Calculate payout for a spin
function calculateTotalPayout(paylineSymbols) {
  let spinTotalPayout = 0;
  const winningPaylines = [];
  let triggeredFreeSpins = 0;

  // First, handle regular payline wins
  paylineSymbols.forEach((symbols, index) => {
    const uniqueSymbols = [...new Set(symbols)];
    const wildsCount = symbols.filter(symbol => symbol === 'Wild').length;
    let baseSymbol = null;
    let isWinning = false;

    if (uniqueSymbols.length === 1) {
      baseSymbol = uniqueSymbols[0];
      isWinning = true;
    } else if (uniqueSymbols.length === 2 && wildsCount > 0) {
      baseSymbol = symbols.find(symbol => symbol !== 'Wild');
      isWinning = true;
    }

    if (isWinning && baseSymbol && payoutsConfig[baseSymbol]) {
      const payout = payoutsConfig[baseSymbol];
      spinTotalPayout += payout;
      winningPaylines.push({
        payline: paylinesConfig[index].name,
        symbol: baseSymbol,
        payout
      });
    }
  });

  // Check for scatter symbols to trigger free spins (only in base game)
  if (!isInFreeSpins) {
    const allSymbols = paylineSymbols.flat();
    const scatterCount = allSymbols.filter(symbol => symbol === 'Scatter').length;
    
    if (scatterCount >= 3) {
      triggeredFreeSpins = 10; // Award 10 free spins for 3 or more scatters
      if (scatterCount > 3) {
        triggeredFreeSpins += (scatterCount - 3) * 5; // Additional 5 free spins per extra scatter
      }
    }
  }

  return { totalPayout: spinTotalPayout, winningPaylines, triggeredFreeSpins };
}

// Run simulation
function runSimulation(numSpins = 1000000) {
  console.log(`Starting simulation with ${numSpins.toLocaleString()} spins...`);
  
  // Reset statistics
  baseGameStats = { totalBet: 0, totalPayout: 0, spins: 0, payoutFrequencies: {} };
  freeSpinStats = { totalPayout: 0, spins: 0, payoutFrequencies: {} };
  
  let jackpotHits = 0;
  let superJackpotHits = 0;
  let freeSpinsTriggered = 0;
  let totalFreeSpins = 0;

  for (let i = 0; i < numSpins; i++) {
    const betAmount = 1; // Fixed bet amount for simulation
    baseGameStats.totalBet += betAmount;
    baseGameStats.spins++;

    // Perform base game spin
    isInFreeSpins = false;
    const matrix = spinReelsMatrix();
    const paylineSymbols = getPaylineSymbols(matrix);
    const { totalPayout: spinPayout, winningPaylines, triggeredFreeSpins } = calculateTotalPayout(paylineSymbols);

    // Handle base game wins
    const baseGamePayout = spinPayout * betAmount;
    baseGameStats.totalPayout += baseGamePayout;
    if (baseGamePayout > 0) {
      baseGameStats.payoutFrequencies[baseGamePayout] = (baseGameStats.payoutFrequencies[baseGamePayout] || 0) + 1;
      
      if (winningPaylines.some(payline => payline.symbol === 'High1')) {
        jackpotHits++;
      }
      if (winningPaylines.some(payline => payline.symbol === 'Wild')) {
        superJackpotHits++;
      }
    }

    // Handle free spins if triggered
    if (triggeredFreeSpins > 0) {
      freeSpinsTriggered++;
      totalFreeSpins += triggeredFreeSpins;
      isInFreeSpins = true;

      // Run free spins
      for (let fs = 0; fs < triggeredFreeSpins; fs++) {
        freeSpinStats.spins++;
        const fsMatrix = spinReelsMatrix();
        const fsPaylineSymbols = getPaylineSymbols(fsMatrix);
        const { totalPayout: fsPayout, winningPaylines: fsWinningPaylines } = calculateTotalPayout(fsPaylineSymbols);

        const freeSpinPayout = fsPayout * betAmount;
        freeSpinStats.totalPayout += freeSpinPayout;
        if (freeSpinPayout > 0) {
          freeSpinStats.payoutFrequencies[freeSpinPayout] = (freeSpinStats.payoutFrequencies[freeSpinPayout] || 0) + 1;
        }
      }
    }

    // Log progress every 100,000 spins
    if ((i + 1) % 100000 === 0) {
      const currentRTP = ((baseGameStats.totalPayout + freeSpinStats.totalPayout) / baseGameStats.totalBet * 100).toFixed(2);
      console.log(`Completed ${(i + 1).toLocaleString()} spins... Current RTP: ${currentRTP}%`);
    }
  }

  // Calculate final statistics
  const baseGameRTP = (baseGameStats.totalPayout / baseGameStats.totalBet) * 100;
  const freeSpinRTP = (freeSpinStats.totalPayout / baseGameStats.totalBet) * 100;
  const totalRTP = baseGameRTP + freeSpinRTP;
  const hitCount = Object.values(baseGameStats.payoutFrequencies).reduce((a, b) => a + b, 0);
  const hitRate = (hitCount / numSpins) * 100;

  // Display results
  console.log('\n=== Simulation Results ===');
  console.log(`Total Base Game Spins: ${baseGameStats.spins.toLocaleString()}`);
  console.log(`Total Free Spins: ${freeSpinStats.spins.toLocaleString()}`);
  console.log(`Free Spins Trigger Rate: ${((freeSpinsTriggered/numSpins)*100).toFixed(4)}%`);
  console.log(`Average Free Spins per Trigger: ${(totalFreeSpins/freeSpinsTriggered).toFixed(2)}`);
  console.log(`Total Bet: ${baseGameStats.totalBet.toLocaleString()}`);
  console.log(`Base Game RTP: ${baseGameRTP.toFixed(2)}%`);
  console.log(`Free Spins RTP: ${freeSpinRTP.toFixed(2)}%`);
  console.log(`Total RTP: ${totalRTP.toFixed(2)}%`);
  console.log(`Hit Rate: ${hitRate.toFixed(2)}%`);
  console.log(`Jackpot Hits: ${jackpotHits.toLocaleString()} (${((jackpotHits/numSpins)*100).toFixed(4)}%)`);
  console.log(`Super Jackpot Hits: ${superJackpotHits.toLocaleString()} (${((superJackpotHits/numSpins)*100).toFixed(4)}%)`);

  // Display payout frequencies for both base game and free spins
  console.log('\n=== Base Game Payout Frequencies ===');
  displayPayoutFrequencies(baseGameStats.payoutFrequencies, numSpins);
  
  console.log('\n=== Free Spins Payout Frequencies ===');
  displayPayoutFrequencies(freeSpinStats.payoutFrequencies, numSpins);
}

function displayPayoutFrequencies(frequencies, totalSpins) {
  Object.entries(frequencies)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([payout, count]) => {
      console.log(`Payout ${payout}: ${count.toLocaleString()} times (${((count/totalSpins)*100).toFixed(2)}%)`);
    });
}

// Run the simulation
loadConfigurations();
runSimulation(1000000); // Run 5 million spins