// Constants
const INITIAL_ELO = 1500;
const K_FACTOR = 32; // Standard K-factor for ELO calculations
const EUROVISION_POINTS = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1]; // Points for top 10 positions

class ChessLeague {
    constructor() {
        this.players = new Map(); // Player name -> {elo, points, wins, draws, losses}
        this.matches = [];
        this.eveningResults = new Map(); // Store results by date
    }

    // Helper to capitalize names
    capitalizeName(name) {
        return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    }

    // Calculate ELO rating change
    calculateEloChange(winnerElo, loserElo) {
        const expectedScore = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
        return Math.round(K_FACTOR * (1 - expectedScore));
    }

    // Process a single match
    processMatch(winner, loser, score = 1, friendly = false) {
        winner = this.capitalizeName(winner);
        loser = this.capitalizeName(loser);

        if (!this.players.has(winner)) {
            this.players.set(winner, { elo: INITIAL_ELO, points: 0, wins: 0, draws: 0, losses: 0 });
        }
        if (!this.players.has(loser)) {
            this.players.set(loser, { elo: INITIAL_ELO, points: 0, wins: 0, draws: 0, losses: 0 });
        }

        const expectedScore = 1 / (1 + Math.pow(10, (this.players.get(loser).elo - this.players.get(winner).elo) / 400));
        const eloChange = Math.round(K_FACTOR * (score - expectedScore));

        this.players.get(winner).elo += eloChange;
        this.players.get(loser).elo -= eloChange;

        // Update stats for all games, including friendly ones
        if (score === 1) {
            this.players.get(winner).wins += 1;
            this.players.get(loser).losses += 1;
        } else if (score === 0.5) {
            this.players.get(winner).draws += 1;
            this.players.get(loser).draws += 1;
        }

        this.matches.push({ winner, loser, score, friendly });
    }

    // Calculate evening results and assign Eurovision points
    calculateEveningResults() {
        const wins = new Map();
        const participants = new Set();
        const performances = new Map(); // Track rating performance
        
        // Only process non-friendly matches
        const tournamentMatches = this.matches.filter(m => !m.friendly);
        
        // Initialize tracking
        tournamentMatches.forEach(match => {
            participants.add(match.winner);
            participants.add(match.loser);
            if (!performances.has(match.winner)) {
                performances.set(match.winner, { 
                    totalRating: 0, 
                    games: 0,
                    score: 0 
                });
            }
            if (!performances.has(match.loser)) {
                performances.set(match.loser, { 
                    totalRating: 0, 
                    games: 0,
                    score: 0 
                });
            }
        });

        // Track wins and calculate performances
        tournamentMatches.forEach(match => {
            wins.set(match.winner, (wins.get(match.winner) || 0) + match.score);
            
            // Update performance data for winner
            const winnerPerf = performances.get(match.winner);
            winnerPerf.totalRating += this.players.get(match.loser).elo;
            winnerPerf.games += 1;
            winnerPerf.score += match.score;
            
            // Update performance data for loser
            const loserPerf = performances.get(match.loser);
            loserPerf.totalRating += this.players.get(match.winner).elo;
            loserPerf.games += 1;
            loserPerf.score += (1 - match.score);
        });

        // Ensure all participants are in the wins map
        participants.forEach(player => {
            if (!wins.has(player)) {
                wins.set(player, 0);
            }
        });

        // Calculate performance ratings
        participants.forEach(player => {
            const perf = performances.get(player);
            if (perf.games > 0) {
                const avgOpponentRating = perf.totalRating / perf.games;
                const scorePercentage = perf.score / perf.games;
                // Standard performance rating formula
                perf.rating = avgOpponentRating + 400 * (2 * scorePercentage - 1);
            } else {
                perf.rating = this.players.get(player).elo;
            }
        });

        // Sort players by wins, then by performance rating
        const sortedPlayers = Array.from(wins.entries())
            .sort((a, b) => {
                const winsA = a[1];
                const winsB = b[1];
                if (winsB !== winsA) return winsB - winsA;
                
                // Use performance rating as tiebreaker
                return performances.get(b[0]).rating - performances.get(a[0]).rating;
            });

        // Group players by number of wins
        const playerGroups = [];
        let currentGroup = [sortedPlayers[0]];

        for (let i = 1; i < sortedPlayers.length; i++) {
            if (sortedPlayers[i][1] === currentGroup[0][1]) {
                currentGroup.push(sortedPlayers[i]);
            } else {
                playerGroups.push(currentGroup);
                currentGroup = [sortedPlayers[i]];
            }
        }
        playerGroups.push(currentGroup);

        // Assign points to groups
        let currentPosition = 0;
        const eveningRankings = [];

        playerGroups.forEach(group => {
            // Calculate points for this position group
            let pointsSum = 0;
            for (let i = 0; i < group.length; i++) {
                const position = currentPosition + i;
                if (position < EUROVISION_POINTS.length) {
                    pointsSum += EUROVISION_POINTS[position];
                }
            }
            
            // Average points for the group
            const pointsPerPlayer = group.length > 0 ? pointsSum / group.length : 0;

            // Create rankings entries for each player in group
            group.forEach(([name, wins]) => {
                eveningRankings.push({
                    name,
                    wins,
                    performance: Math.round(performances.get(name).rating),
                    points: pointsPerPlayer
                });

                // Update total points for the player
                const player = this.players.get(name);
                player.points += pointsPerPlayer;
            });

            currentPosition += group.length;
        });

        return eveningRankings;
    }

    // Parse match results from text
    parseMatchResults(text, date) {
        const matches = text.trim().split('\n');
        const eveningMatches = [];
        this.matches = []; // Reset matches for this evening
        
        matches.forEach(match => {
            if (!match.trim()) return;

            const friendly = match.startsWith('*');
            const matchText = friendly ? match.slice(1).trim() : match;

            const [playersSection, scoreSection] = matchText.split(/(?<=\w)\s+(?=\d)/);
            if (!playersSection || !scoreSection) {
                console.error('Invalid match format:', match);
                return;
            }

            const [white, black] = playersSection.split('-').map(p => p.trim());
            const [score1, score2] = scoreSection.split('-').map(s => parseInt(s.trim()));
            
            if (isNaN(score1) || isNaN(score2)) {
                console.error('Invalid score format:', scoreSection);
                return;
            }

            // Only add to evening matches if not friendly
            if (!friendly) {
                eveningMatches.push({ 
                    white: this.capitalizeName(white),
                    black: this.capitalizeName(black),
                    score: `${score1}-${score2}`
                });
            }

            // Process match with friendly flag
            if (score1 > score2) {
                this.processMatch(white, black, 1, friendly);
            } else if (score1 < score2) {
                this.processMatch(black, white, 1, friendly);
            } else {
                // For draws, only process once with 0.5 points each
                this.processMatch(white, black, 0.5, friendly);
            }
        });
        
        // Calculate evening results only from non-friendly matches
        const rankings = this.calculateEveningResults();
        this.eveningResults.set(date, {
            matches: eveningMatches,
            rankings: rankings
        });
    }

    // Get standings
    getStandings() {
        return Array.from(this.players.entries())
            .map(([name, data]) => ({
                name,
                points: data.points,
                elo: data.elo,
                wins: data.wins,
                draws: data.draws,
                losses: data.losses,
                score: data.wins + (data.draws * 0.5)
            }))
            .sort((a, b) => b.points - a.points);
    }

    getEveningResults(date) {
        return this.eveningResults.get(date);
    }
}

const league = new ChessLeague();
let processedEvenings = [];

// Load results from files
async function loadAllResults() {
    try {
        // Check if we're on GitHub Pages
        const isGitHubPages = location.hostname.includes('github.io');
        const basePath = isGitHubPages ? '/chess-league' : '';
        
        const response = await fetch(`${basePath}/results/index.json`);
        const files = await response.json();
        console.log('Found files:', files);
        
        const sortedFiles = files.sort();
        
        for (const file of sortedFiles) {
            console.log('Processing file:', file);
            const response = await fetch(`${basePath}/results/${file}`);
            const text = await response.text();
            const date = file.replace('.txt', '');
            league.parseMatchResults(text, date);
            processedEvenings.push(date);
        }
        
        displayStandings();
        displayProcessedEvenings();
        displayNextEvent();
    } catch (error) {
        console.error('Error loading results:', error);
    }
}

// Load results when page loads
loadAllResults();

// Display standings
function displayStandings() {
    const standings = league.getStandings();
    const tbody = document.getElementById('standings-body');
    tbody.innerHTML = '';

    standings.forEach((player, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${player.name}</td>
            <td>${player.points}</td>
            <td>${player.wins}-${player.draws}-${player.losses}</td>
            <td>${Math.round(player.elo)}</td>
        `;
        tbody.appendChild(row);
    });
}

// Helper function to format dates consistently
function formatDate(date) {
    return date.toLocaleDateString('nb-NO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

// Add function to display processed evenings
function displayProcessedEvenings() {
    const list = document.getElementById('evenings-list');
    list.innerHTML = '';
    
    processedEvenings.forEach(evening => {
        const li = document.createElement('li');
        const [year, month, day] = evening.split('-').map(num => parseInt(num, 10));
        const date = new Date(year, month - 1, day);
        
        const dateSpan = document.createElement('span');
        dateSpan.textContent = formatDate(date);
        dateSpan.style.cursor = 'pointer';
        
        const resultsDiv = document.createElement('div');
        resultsDiv.className = 'evening-results';
        resultsDiv.style.display = 'none';
        
        const results = league.getEveningResults(evening);
        if (results) {
            // Show rankings
            const rankingsDiv = document.createElement('div');
            rankingsDiv.className = 'evening-rankings';
            rankingsDiv.innerHTML = '<h3>Kveldens resultater</h3>';
            
            const rankingsTable = document.createElement('table');
            rankingsTable.innerHTML = `
                <tr>
                    <th>Plass</th>
                    <th>Spiller</th>
                    <th>Score</th>
                    <th>Performance</th>
                    <th>Poeng</th>
                </tr>
            `;
            
            results.rankings.forEach((player, index) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${player.name}</td>
                    <td>${player.wins}</td>
                    <td>${player.performance}</td>
                    <td>${player.points}</td>
                `;
                rankingsTable.appendChild(row);
            });
            
            rankingsDiv.appendChild(rankingsTable);
            resultsDiv.appendChild(rankingsDiv);

            // Show matches
            const matchesDiv = document.createElement('div');
            matchesDiv.className = 'evening-matches';
            matchesDiv.innerHTML = '<h3>Partier</h3>';
            
            const matchesList = document.createElement('ul');
            results.matches.forEach(match => {
                const matchLi = document.createElement('li');
                matchLi.innerHTML = `${match.white} - ${match.black} ${match.score}`;
                matchesList.appendChild(matchLi);
            });
            
            // Add friendly matches if any exist
            const friendlyMatches = league.matches
                .filter(m => m.friendly)
                .map(m => ({
                    white: m.winner,
                    black: m.loser,
                    score: m.score === 1 ? '1-0' : (m.score === 0.5 ? '½-½' : '0-1')
                }));

            matchesDiv.appendChild(matchesList);
            resultsDiv.appendChild(matchesDiv);
            
            if (friendlyMatches.length > 0) {
                const friendlyDiv = document.createElement('div');
                friendlyDiv.className = 'friendly-matches';
                friendlyDiv.innerHTML = '<h3>Ikke-tellende partier</h3>';
                
                const friendlyList = document.createElement('ul');
                friendlyMatches.forEach(match => {
                    const matchLi = document.createElement('li');
                    matchLi.innerHTML = `${match.white} - ${match.black} ${match.score}`;
                    matchLi.className = 'friendly-match';
                    friendlyList.appendChild(matchLi);
                });
                
                friendlyDiv.appendChild(friendlyList);
                resultsDiv.appendChild(friendlyDiv);
            }
        }
        
        dateSpan.addEventListener('click', () => {
            const isVisible = resultsDiv.style.display === 'block';
            resultsDiv.style.display = isVisible ? 'none' : 'block';
        });
        
        li.appendChild(dateSpan);
        li.appendChild(resultsDiv);
        list.appendChild(li);
    });
}

// Add function to display next event
function displayNextEvent() {
    const lastEvent = processedEvenings[processedEvenings.length - 1];
    if (!lastEvent) return;

    const [year, month, day] = lastEvent.split('-').map(num => parseInt(num, 10));
    const lastDate = new Date(year, month - 1, day);
    const nextDate = new Date(lastDate);
    nextDate.setDate(lastDate.getDate() + 14);

    const nextEventElement = document.getElementById('next-event');
    nextEventElement.textContent = formatDate(nextDate);
}

displayStandings(); 