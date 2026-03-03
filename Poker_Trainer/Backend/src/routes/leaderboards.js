const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET /api/leaderboards — top players (from Supabase when configured)
router.get('/', async (_req, res) => {
  try {
    if (supabase) {
      // const { data, error } = await supabase.from('leaderboard').select('*').order('chips', { ascending: false }).limit(10);
      // if (error) return res.status(500).json({ error: error.message });
      // return res.json(data);
    }
    // Fallback mock data
    const mock = [
      { name: 'AceMaster', rank: 'Diamond', chips: 25000, winrate: '68%' },
      { name: 'CardShark', rank: 'Platinum', chips: 18200, winrate: '64%' },
      { name: 'BluffKing', rank: 'Gold', chips: 15100, winrate: '61%' },
      { name: 'RiverQueen', rank: 'Gold', chips: 12000, winrate: '59%' },
      { name: 'PocketPair', rank: 'Silver', chips: 9800, winrate: '55%' },
    ];
    res.json(mock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
