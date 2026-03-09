const express  = require("express");
const router   = express.Router();
const multer   = require("multer");

const supabaseClient = require("../config/supabaseClient");
const supabaseAdmin  = require("../config/supabaseAdmin");

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

async function getAuthId(req, res) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return null;
  }
  const token = header.split(" ")[1];
  const { data, error } = await supabaseClient.auth.getUser(token);
  if (error || !data?.user) {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }
  return data.user.id;
}

router.patch("/username", async (req, res) => {
  try {
    const authId = await getAuthId(req, res);
    if (!authId) return;

    const { username } = req.body || {};
    if (!username || username.trim().length < 2) {
      return res.status(400).json({ error: "Username must be at least 2 characters" });
    }
    if (username.trim().length > 24) {
      return res.status(400).json({ error: "Username must be 24 characters or fewer" });
    }

    const clean = username.trim();

    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("user_id")
      .eq("username", clean)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const { error: updateErr } = await supabaseAdmin
      .from("users")
      .update({ username: clean })
      .eq("auth_id", authId);

    if (updateErr) {
      console.error("[profile/username] update error:", updateErr);
      return res.status(500).json({ error: "Failed to update username" });
    }

    res.json({ success: true, username: clean });

  } catch (err) {
    console.error("[profile/username] exception:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/avatar", upload.single("avatar"), async (req, res) => {
  try {
    const authId = await getAuthId(req, res);
    if (!authId) return;

    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("username")
      .eq("auth_id", authId)
      .maybeSingle();

    if (userErr || !user) {
      return res.status(404).json({ error: "User not found" });
    }

    const fileName = `${user.username}.png`;

    const { error: uploadErr } = await supabaseAdmin
      .storage
      .from("avatars")
      .upload(fileName, req.file.buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      console.error("[profile/avatar] upload error:", uploadErr);
      return res.status(500).json({ error: "Failed to upload avatar: " + uploadErr.message });
    }

    const { data: urlData } = supabaseAdmin
      .storage
      .from("avatars")
      .getPublicUrl(fileName);

    const publicUrl = urlData?.publicUrl || null;

    await supabaseAdmin
      .from("users")
      .update({ avatar_url: publicUrl })
      .eq("auth_id", authId);

    res.json({ success: true, avatarUrl: publicUrl });

  } catch (err) {
    console.error("[profile/avatar] exception:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/avatar/:username", async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) return res.status(400).json({ error: "Username required" });

    const fileName = `${username}.png`;

    const { data } = supabaseAdmin
      .storage
      .from("avatars")
      .getPublicUrl(fileName);

    res.json({ avatarUrl: data?.publicUrl || null });

  } catch (err) {
    console.error("[profile/avatar GET] exception:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;