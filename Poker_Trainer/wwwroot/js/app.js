function login() {
    if (user.value === "admin" && pass.value === "1234") {
        window.location.href = "menu.html";
    } else {
        alert("Invalid login");
    }
}

function goPlay() {
    window.location.href = "play.html";
}

function goProfile() {
    window.location.href = "profile.html";
}

function goLeaderboards() {
    window.location.href = "leaderboards.html";
}

function logout() {
    window.location.href = "index.html";
}

let xp = 0;
let rankIndex = 0;

const ranks = [
    "Bronze",
    "Silver",
    "Gold",
    "Platinum",
    "Diamond"
];

function addXP(amount) {
    xp += amount;

    if (xp >= 100) {
        xp = xp - 100;
        rankIndex++;

        if (rankIndex >= ranks.length) {
            rankIndex = ranks.length - 1;
        }
    }

    updateProfileUI();
}

function updateProfileUI() {
    const fill = document.getElementById("xpFill");
    const xpText = document.getElementById("xpText");
    const rankLabel = document.getElementById("rankLabel");

    if (!fill) return; // prevents errors if not on profile page

    fill.style.width = xp + "%";
    xpText.innerText = `XP: ${xp} / 100`;
    rankLabel.innerText = "Rank: " + ranks[rankIndex];
}

function goMenu() {
    window.location.href = "menu.html";
}

const leaderboardData = [
    { name: "AceMaster", rank: "Diamond", chips: 25000, winrate: "68%" },
    { name: "CardShark", rank: "Platinum", chips: 18200, winrate: "64%" },
    { name: "BluffKing", rank: "Gold", chips: 15100, winrate: "61%" },
    { name: "RiverQueen", rank: "Gold", chips: 12000, winrate: "59%" },
    { name: "PocketPair", rank: "Silver", chips: 9800, winrate: "55%" }
];

function loadLeaderboard() {
    const body = document.getElementById("leaderboardBody");
    if (!body) return;

    body.innerHTML = "";

    leaderboardData.forEach((player, index) => {
        const row = document.createElement("tr");

        if (index === 0) row.className = "rank-1";
        if (index === 1) row.className = "rank-2";
        if (index === 2) row.className = "rank-3";

        row.innerHTML = `
      <td>${index + 1}</td>
      <td>${player.name}</td>
      <td>${player.rank}</td>
      <td>$${player.chips}</td>
      <td>${player.winrate}</td>
    `;

        body.appendChild(row);
    });
}

loadLeaderboard();

