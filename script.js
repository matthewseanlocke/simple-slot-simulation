// script.js

// Encapsulate code to avoid global scope pollution
(function() {
  // Configuration Objects
  let symbols = {};         // To store symbol mappings from symbols.json
  let reels = [];           // To store reels data from reels.json
  let paylinesConfig = [];  // To store paylines data from paylines.json
  let payoutsConfig = {};   // To store payouts data from payouts.json
  let payouts = {};         // Final payouts mapping
  let freeSpinsReels = [];  // To store free spins reels data
  let freeSpinsRemaining = 0;
  let isInFreeSpins = false;
  
  // Game State Variables
  let totalSpins = 0;
  let totalBet = 0;
  let totalPayout = 0;
  const payoutFrequencies = {};
  let jackpotHits = 0;
  let superJackpotHits = 0;
  let userBalance = 1000; // Starting balance
  
  // DOM Elements
  const spinButton = document.getElementById('spin-button');
  const totalSpinsElem = document.getElementById('total-spins');
  const totalBetElem = document.getElementById('total-bet');
  const totalPayoutElem = document.getElementById('total-payout');
  const rtpElem = document.getElementById('rtp');
  const hitRateElem = document.getElementById('hit-rate');
  const jackpotHitsElem = document.getElementById('jackpot-hits');
  const superJackpotHitsElem = document.getElementById('super-jackpot-hits');
  const payoutList = document.getElementById('payout-list');
  const userBalanceElem = document.getElementById('user-balance');
  const betAmountSelect = document.getElementById('bet-amount');
  
  // Winning Paylines and Total Win Elements
  const winningPaylinesElem = document.getElementById('winning-paylines');
  const totalWinElem = document.getElementById('total-win');
  
  // Optional: Win Sound
  const winSound = document.getElementById('win-sound');
  
  // Store current winning paylines globally for resuming animations
  let currentWinningPaylines = [];
  
  // Animation Interval ID
  let blinkIntervalId = null;
  
  // Load all configuration files
  async function loadConfigurations() {
    try {
      // Load symbols
      const symbolsResponse = await fetch('config/symbols.json');
      if (!symbolsResponse.ok) {
        throw new Error(`Failed to load symbols.json: ${symbolsResponse.status} ${symbolsResponse.statusText}`);
      }
      symbols = await symbolsResponse.json();
  
      // Load reels
      const reelsResponse = await fetch('config/reels.json');
      if (!reelsResponse.ok) {
        throw new Error(`Failed to load reels.json: ${reelsResponse.status} ${reelsResponse.statusText}`);
      }
      reels = await reelsResponse.json();
  
      // Load paylines
      const paylinesResponse = await fetch('config/paylines.json');
      if (!paylinesResponse.ok) {
        throw new Error(`Failed to load paylines.json: ${paylinesResponse.status} ${paylinesResponse.statusText}`);
      }
      paylinesConfig = await paylinesResponse.json();
  
      // Load payouts
      const payoutsResponse = await fetch('config/payouts.json');
      if (!payoutsResponse.ok) {
        throw new Error(`Failed to load payouts.json: ${payoutsResponse.status} ${payoutsResponse.statusText}`);
      }
      payoutsConfig = await payoutsResponse.json();
  
      // Update payouts configuration
      payouts = payoutsConfig;
  
      // Load free spins reels
      const freeSpinsReelsResponse = await fetch('config/freespins-reels.json');
      if (!freeSpinsReelsResponse.ok) {
        throw new Error(`Failed to load freespins-reels.json: ${freeSpinsReelsResponse.status}`);
      }
      freeSpinsReels = await freeSpinsReelsResponse.json();
  
      // Initialize reels on the UI
      initializeReels();
  
      // Load user balance from localStorage if available
      const savedBalance = localStorage.getItem('userBalance');
      if (savedBalance !== null) {
        userBalance = parseInt(savedBalance, 10);
        userBalanceElem.textContent = userBalance.toLocaleString();
      }
    } catch (error) {
      console.error('Error loading configuration files:', error);
      alert(`Error loading configuration files:\n${error.message}`);
    }
  }
  
  /**
   * Initializes the reels on the UI with default symbols.
   */
  function initializeReels() {
    reels.forEach((reel, reelIndex) => {
      const reelElement = document.getElementById(`reel-${reelIndex + 1}`);
      reelElement.innerHTML = ''; // Clear existing symbols
  
      // Populate with default symbols (first three symbols of the reel)
      for (let row = 0; row < 3; row++) {
        const symbolName = reel[row % reel.length];
        const symbolImgSrc = symbols[symbolName];
        const symbolAlt = symbolName;
        
        const symbolDiv = document.createElement('div');
        symbolDiv.classList.add('symbol');
        
        const imgElement = document.createElement('img');
        imgElement.src = symbolImgSrc;
        imgElement.alt = symbolAlt;
        
        symbolDiv.appendChild(imgElement);
        reelElement.appendChild(symbolDiv);
      }
    });
  }
  
  /**
   * Spins all reels and returns a 3x3 matrix of symbols.
   * Each sub-array represents a row in the matrix.
   */
  function spinReelsMatrix() {
    const matrix = [[], [], []];
    const currentReels = isInFreeSpins ? freeSpinsReels : reels;

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
  
  /**
   * Defines the paylines based on the matrix.
   * @param {Array} matrix - 3x3 symbol matrix.
   * @returns {Array} - Array of symbol arrays for each payline.
   */
  function getPaylineSymbols(matrix) {
    return paylinesConfig.map(payline => {
      return payline.positions.map((position, reelIndex) => {
        return matrix[position][reelIndex];
      });
    });
  }
  
  /**
   * Calculates the total payout based on the paylines.
   * Considers wild symbols as substitutes for any other symbol.
   * @param {Array} paylineSymbols - Array of symbol arrays for each payline.
   * @returns {Object} - Contains totalPayout and array of winningPaylines.
   */
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
  
      if (isWinning && baseSymbol && payouts[baseSymbol] && baseSymbol !== 'Scatter') {
        const payout = payouts[baseSymbol];
        spinTotalPayout += payout;
        winningPaylines.push({
          payline: paylinesConfig[index].name,
          symbol: baseSymbol,
          payout
        });
      }
    });

    const allSymbols = paylineSymbols.flat();
    const scatterCount = allSymbols.filter(symbol => symbol === 'Scatter').length;
  
    // Define scatter pays
    if (scatterCount >= 3) {
      const scatterPayout = payouts['Scatter'] * scatterCount;
      spinTotalPayout += scatterPayout;
      winningPaylines.push({
        payline: 'Scatter Win',
        symbol: 'Scatter',
        positions: allSymbols.map((symbol, index) => ({
          reel: index % 3,
          position: Math.floor(index / 3),
          isScatter: symbol === 'Scatter'
        })).filter(pos => pos.isScatter)
      });

      if (!isInFreeSpins) {
        triggeredFreeSpins = 10;
      }
    }    
    return { totalPayout: spinTotalPayout, winningPaylines, triggeredFreeSpins };
  }
  
  /**
   * Updates the reels on the UI based on the spin result.
   * @param {Array} matrix - 3x3 symbol matrix.
   */
  function updateReels(matrix) {
    reels.forEach((reel, reelIndex) => {
      const reelElement = document.getElementById(`reel-${reelIndex + 1}`);
      // Clear existing symbols
      reelElement.innerHTML = '';
      // Add new symbols from the matrix column
      for (let row = 0; row < 3; row++) {
        const symbolName = matrix[row][reelIndex];
        const symbolImgSrc = symbols[symbolName];
        const symbolAlt = symbolName;
        
        const symbolDiv = document.createElement('div');
        symbolDiv.classList.add('symbol');
        
        const imgElement = document.createElement('img');
        imgElement.src = symbolImgSrc;
        imgElement.alt = symbolAlt;
        
        symbolDiv.appendChild(imgElement);
        reelElement.appendChild(symbolDiv);
      }
    });
  }
  
  /**
   * Updates the statistics on the UI.
   */
  function updateStats() {
    totalSpinsElem.textContent = totalSpins.toLocaleString();
    totalBetElem.textContent = totalBet.toLocaleString();
    totalPayoutElem.textContent = totalPayout.toLocaleString();
    rtpElem.textContent = totalBet > 0 ? ((totalPayout / totalBet) * 100).toFixed(2) : '0.00';
    
    const totalWinningSpins = Object.values(payoutFrequencies).reduce((a, b) => a + b, 0);
    const hitRate = totalSpins > 0 ? (totalWinningSpins / totalSpins) * 100 : 0;
    hitRateElem.textContent = hitRate.toFixed(2);
    
    jackpotHitsElem.textContent = jackpotHits.toLocaleString();
    superJackpotHitsElem.textContent = superJackpotHits.toLocaleString();
    
    // Update payout frequencies
    payoutList.innerHTML = '';
    for (const [payout, count] of Object.entries(payoutFrequencies).sort((a, b) => a[0] - b[0])) {
      const li = document.createElement('li');
      li.textContent = `Payout ${payout}: ${Number(count).toLocaleString()} times (${((count / totalSpins) * 100).toFixed(2)}%)`;
      payoutList.appendChild(li);
    }
  }
  
  /**
   * Updates the Winning Paylines and Total Win on the UI.
   * @param {Array} winningPaylines - Array of winning paylines.
   * @param {Number} spinPayout - Total payout for the spin.
   */
  function updateResults(winningPaylines, spinPayout) {
    if (winningPaylines.length > 0) {
      const paylineDescriptions = winningPaylines.map(wp => `${wp.payline} (${wp.symbol})`);
      winningPaylinesElem.textContent = paylineDescriptions.join(', ');
    } else {
      winningPaylinesElem.textContent = 'None';
    }
  
    totalWinElem.textContent = spinPayout.toLocaleString();
  }
  
  /**
   * Applies sequential blink animations to winning paylines continuously.
   * @param {Array} winningPaylines - Array of winning paylines.
   */
  function applyBlinkAnimation(winningPaylines) {
    if (blinkIntervalId) {
      clearInterval(blinkIntervalId);
      blinkIntervalId = null;
    }
  
    if (winningPaylines.length === 0) return;
  
    let currentPaylineIndex = 0;
  
    const highlightPayline = (payline) => {
      if (payline.payline === 'Scatter Win') {
        // Handle scatter win animation
        payline.positions.forEach(pos => {
          const reel = document.getElementById(`reel-${pos.reel + 1}`);
          const symbol = reel.children[pos.position];
          symbol.classList.add('blink');
        });
      } else {
        // Regular payline animation (existing code)
        const paylineConfig = paylinesConfig.find(p => p.name === payline.payline);
        if (!paylineConfig) return;
  
        paylineConfig.positions.forEach((position, reelIndex) => {
          const reel = document.getElementById(`reel-${reelIndex + 1}`);
          const symbol = reel.children[position];
          symbol.classList.add('blink');
        });
      }
    };
  
    const removeHighlightPayline = (payline) => {
      if (payline.payline === 'Scatter Win') {
        // Handle scatter win animation removal
        payline.positions.forEach(pos => {
          const reel = document.getElementById(`reel-${pos.reel + 1}`);
          const symbol = reel.children[pos.position];
          symbol.classList.remove('blink');
        });
      } else {
        // Regular payline animation removal (existing code)
        const paylineConfig = paylinesConfig.find(p => p.name === payline.payline);
        if (!paylineConfig) return;
  
        paylineConfig.positions.forEach((position, reelIndex) => {
          const reel = document.getElementById(`reel-${reelIndex + 1}`);
          const symbol = reel.children[position];
          symbol.classList.remove('blink');
        });
      }
    };
  
    // Rest of the function remains the same
    highlightPayline(winningPaylines[currentPaylineIndex]);
  
    blinkIntervalId = setInterval(() => {
      removeHighlightPayline(winningPaylines[currentPaylineIndex]);
      currentPaylineIndex = (currentPaylineIndex + 1) % winningPaylines.length;
      highlightPayline(winningPaylines[currentPaylineIndex]);
    }, 3000);
  }  
  /**
   * Event Listener for Spin Button
   */
  spinButton.addEventListener('click', () => {
    const betAmount = parseInt(betAmountSelect.value, 10);

    // Only check balance in base game
    if (!isInFreeSpins) {
      if (betAmount > userBalance) {
        alert('Insufficient balance to place this bet.');
        return;
      }
      // Deduct bet amount from user balance
      userBalance -= betAmount;
      userBalanceElem.textContent = userBalance.toLocaleString();
    }

    // Perform Spin
    const matrix = spinReelsMatrix();
    updateReels(matrix);

    const paylineSymbols = getPaylineSymbols(matrix);
    const { totalPayout: spinPayout, winningPaylines, triggeredFreeSpins } = calculateTotalPayout(paylineSymbols);

// Replace the free spins handling code (around line 376-381) with:
if (triggeredFreeSpins > 0) {
  freeSpinsRemaining = triggeredFreeSpins;
  isInFreeSpins = true;
  
  // Show free spins indicator and update count
  const freeSpinsIndicator = document.getElementById('free-spins-indicator');
  const freeSpinsCount = document.getElementById('free-spins-count');
  freeSpinsIndicator.classList.remove('hidden');
  freeSpinsCount.textContent = freeSpinsRemaining;
}

    // Update UI Results
    updateResults(winningPaylines, spinPayout * betAmount);
  
    // Apply Sequential Blink Animation to Winning Symbols
    applyBlinkAnimation(winningPaylines);
  
    // Play Win Sound if Applicable
    if (spinPayout > 0) {
      winSound.currentTime = 0;
      winSound.play();
    }
  
    // Update Game State
    totalSpins++;
    if (!isInFreeSpins) {
      totalBet += betAmount;
    }
    const payoutAmount = spinPayout * betAmount;
    totalPayout += payoutAmount;

    if (payoutAmount > 0) {
      payoutFrequencies[payoutAmount] = (payoutFrequencies[payoutAmount] || 0) + 1;
  
      // Add payout to user balance
      userBalance += payoutAmount;
      userBalanceElem.textContent = userBalance.toLocaleString();
  
      // Check for Jackpot (assuming 'High1' represents a special symbol like '7')
      if (winningPaylines.some(payline => payline.symbol === 'High1')) {
        jackpotHits++;
      }
  
      // Check for Super Jackpot (assuming 'Wild' represents wild symbols)
      if (winningPaylines.some(payline => payline.symbol === 'Wild')) {
        superJackpotHits++;
      }
    }
  
    // Update Statistics UI
    updateStats();
  
    // Store current winning paylines for potential resume
    currentWinningPaylines = winningPaylines;
  
    // Save user balance to localStorage
    localStorage.setItem('userBalance', userBalance);

    // Handle Free Spins countdown
    if (isInFreeSpins) {
      freeSpinsRemaining--;
      document.getElementById('free-spins-count').textContent = freeSpinsRemaining;
      
      if (freeSpinsRemaining === 0) {
        isInFreeSpins = false;
        document.getElementById('free-spins-indicator').classList.add('hidden');
      }
    }
  });
  
  /**
   * Initialize configurations on page load
   */
  window.addEventListener('DOMContentLoaded', loadConfigurations);
})();
