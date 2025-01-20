// Constants
const INITIAL_ELO = 1500;
const K_FACTOR = 32; // Standard K-factor for ELO calculations
const EUROVISION_POINTS = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1]; // Points for top 10 positions

class ChessLeague {
    constructor() {
        this.players = new Map(); // Player name -> {elo, points, wins, losses}
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
    processMatch(winner, loser) {
        winner = this.capitalizeName(winner);
        loser = this.capitalizeName(loser);

        if (!this.players.has(winner)) {
            this.players.set(winner, { elo: INITIAL_ELO, points: 0, wins: 0, losses: 0 });
        }
        if (!this.players.has(loser)) {
            this.players.set(loser, { elo: INITIAL_ELO, points: 0, wins: 0, losses: 0 });
        }

        const eloChange = this.calculateEloChange(
            this.players.get(winner).elo,
            this.players.get(loser).elo
        );

        this.players.get(winner).elo += eloChange;
        this.players.get(loser).elo -= eloChange;
        this.players.get(winner).wins += 1;
        this.players.get(loser).losses += 1;

        this.matches.push({ winner, loser });
    }

    // Calculate evening results and assign Eurovision points
    calculateEveningResults() {
        const wins = new Map();
        const participants = new Set();
        
        // Track all participants and count wins
        this.matches.forEach(match => {
            participants.add(match.winner);
            participants.add(match.loser);
            wins.set(match.winner, (wins.get(match.winner) || 0) + 1);
        });

        // Ensure all participants are in the wins map
        participants.forEach(player => {
            if (!wins.has(player)) {
                wins.set(player, 0);
            }
        });

        // Sort players by wins
        const sortedPlayers = Array.from(wins.entries())
            .sort((a, b) => b[1] - a[1]);

        // Store evening rankings with points
        const eveningRankings = sortedPlayers.map((player, index) => ({
            name: player[0],
            wins: player[1],
            points: index < EUROVISION_POINTS.length ? EUROVISION_POINTS[index] : 0
        }));

        // Assign points to players
        sortedPlayers.forEach((player, index) => {
            if (index < EUROVISION_POINTS.length) {
                const currentPoints = this.players.get(player[0]).points || 0;
                this.players.get(player[0]).points = currentPoints + EUROVISION_POINTS[index];
            }
        });

        return eveningRankings;
    }

    // Parse match results from text
    parseMatchResults(text, date) {
        const matches = text.trim().split('\n');
        const eveningMatches = [];
        this.matches = []; // Reset matches for this evening
        
        matches.forEach(match => {
            // Skip empty lines
            if (!match.trim()) return;

            // First split the line into players and score
            const [playersSection, scoreSection] = match.split(/(?<=\w)\s+(?=\d)/);
            if (!playersSection || !scoreSection) {
                console.error('Invalid match format:', match);
                return;
            }

            // Split players section - player1 is White, player2 is Black
            const [white, black] = playersSection.split('-').map(p => p.trim());
            
            // Parse score section
            const [score1, score2] = scoreSection.split('-').map(s => parseInt(s.trim()));
            
            if (isNaN(score1) || isNaN(score2)) {
                console.error('Invalid score format:', scoreSection);
                return;
            }

            
            // Store match with original player order (White-Black)
            eveningMatches.push({ 
                white: this.capitalizeName(white),
                black: this.capitalizeName(black),
                score: `${score1}-${score2}`
            });

            // Process match for standings (winner/loser)
            if (score1 > score2) {
                this.processMatch(white, black);
            } else {
                this.processMatch(black, white);
            }
        });
        
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
                losses: data.losses
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
            <td>${player.wins}</td>
            <td>${player.losses}</td>
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
                    <th>Seire</th>
                    <th>Poeng</th>
                </tr>
            `;
            
            results.rankings.forEach((player, index) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${player.name}</td>
                    <td>${player.wins}</td>
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
                matchLi.textContent = `${match.white} - ${match.black} ${match.score}`;
                matchesList.appendChild(matchLi);
            });
            
            matchesDiv.appendChild(matchesList);
            resultsDiv.appendChild(matchesDiv);
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