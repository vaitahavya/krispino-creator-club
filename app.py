#!/usr/bin/env python3
"""
Krispino Creator Club — Influencer Onboarding & Admin Platform
Zero-dependency Python backend (stdlib http.server + SQLite3).
"""

import csv
import hashlib
import io
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "krispino.db")
STATIC_DIR = os.path.join(BASE_DIR, "static")

STATUSES = [
    "New",
    "Shortlisted",
    "Box sent",
    "Draft received",
    "Draft approved",
    "Posted",
    "Not a fit",
]

TIERS = ["Taster", "Explorer", "Ambassador"]

FLAVOURS = [
    {"id": "wasa-boom", "name": "Wasa-Boom", "pair": "Kanthari chilli × wasabi", "base": "Tapioca", "heat": "Hot"},
    {"id": "guntur-jerk", "name": "Guntur Jerk", "pair": "Guntur chilli × Jamaican jerk", "base": "Potato", "heat": "Extra Hot"},
    {"id": "chilli-ciao", "name": "Chilli Ciao", "pair": "Indian mirchi × Italian garlic & olive oil", "base": "Potato", "heat": "Medium"},
    {"id": "peri-peri-pataka", "name": "Peri Peri Pataka", "pair": "Nimbu-jeera × peri-peri", "base": "Banana", "heat": "Hot"},
    {"id": "masala-fiesta", "name": "Masala Fiesta", "pair": "Chatpata masala × Spanish smoked paprika", "base": "Potato", "heat": "Medium"},
    {"id": "sour-cream-jalwa", "name": "Sour Cream Jalwa", "pair": "Jeera raita × American ranch", "base": "Potato", "heat": "Mild"},
    {"id": "salsa-masti", "name": "Salsa Masti", "pair": "Tomato chutney × Mexican salsa", "base": "Tapioca", "heat": "Medium"},
    {"id": "pepper-bonjour", "name": "Pepper Bonjour", "pair": "Black pepper × French herbs", "base": "Banana", "heat": "Mild"},
    {"id": "og-salt", "name": "OG Salt", "pair": "The classic, lightly salted", "base": "Banana", "heat": "Mild"},
]


def hash_password(password: str, salt: str | None = None) -> str:
    if not salt:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    if not stored or "$" not in stored:
        return False
    salt, expected = stored.split("$", 1)
    return secrets.compare_digest(hash_password(password, salt), f"{salt}${expected}")


def infer_tier(followers_range: str) -> str:
    if followers_range in ("100K – 500K", "500K+"):
        return "Ambassador"
    if followers_range in ("10K – 50K", "50K – 100K"):
        return "Explorer"
    return "Taster"


def generate_discount_code(name: str, handle: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9]", "", (name.split()[0] if name else handle)).upper()
    prefix = (clean[:8] or "KRISP")
    return f"{prefix}15"


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = get_db()
    with conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'influencer')),
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS creators (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
                name TEXT NOT NULL,
                handle TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL,
                city TEXT NOT NULL,
                pincode TEXT NOT NULL,
                address TEXT DEFAULT '',
                followers TEXT NOT NULL,
                views TEXT DEFAULT '',
                niche_json TEXT NOT NULL DEFAULT '[]',
                other_platforms TEXT DEFAULT '',
                idea TEXT NOT NULL,
                preferred_flavours_json TEXT NOT NULL DEFAULT '[]',
                tier TEXT NOT NULL DEFAULT 'Taster',
                status TEXT NOT NULL DEFAULT 'New',
                discount_code TEXT DEFAULT '',
                code_uses INTEGER NOT NULL DEFAULT 0,
                collab_fee INTEGER NOT NULL DEFAULT 0,
                payout_status TEXT NOT NULL DEFAULT 'Pending',
                box_tracking TEXT DEFAULT '',
                box_carrier TEXT DEFAULT 'BlueDart Express',
                draft_url TEXT DEFAULT '',
                draft_caption TEXT DEFAULT '',
                draft_submitted_at INTEGER DEFAULT 0,
                draft_feedback TEXT DEFAULT '',
                live_post_url TEXT DEFAULT '',
                live_story_url TEXT DEFAULT '',
                live_views INTEGER NOT NULL DEFAULT 0,
                posted_at INTEGER DEFAULT 0,
                admin_notes TEXT DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            """
        )

        # Seed Admin if not exists
        now = int(time.time() * 1000)
        admin_row = conn.execute("SELECT id FROM users WHERE email = ?", ("admin@krispino.in",)).fetchone()
        if not admin_row:
            conn.execute(
                "INSERT INTO users (email, password_hash, role, name, created_at) VALUES (?, ?, 'admin', ?, ?)",
                ("admin@krispino.in", hash_password("Krispino@2026"), "Krispino Brand Team", now),
            )

        # Seed realistic creators if table is empty
        count = conn.execute("SELECT COUNT(*) as c FROM creators").fetchone()["c"]
        if count == 0:
            seed_creators = [
                {
                    "name": "Ananya Rao",
                    "handle": "@ananyaeats",
                    "email": "ananya@example.com",
                    "phone": "+91 98450 11223",
                    "city": "Bengaluru",
                    "pincode": "560034",
                    "address": "42, 4th Cross, Koramangala 3rd Block, Bengaluru",
                    "followers": "10K – 50K",
                    "views": "24,500",
                    "niche": ["Food & reviews", "Lifestyle"],
                    "other_platforms": "youtube.com/@ananyaeatsblr",
                    "idea": "Blind taste test with my flatmates: guessing both the Indian spice and the international pairing in 30 seconds!",
                    "preferred_flavours": ["Guntur Jerk", "Wasa-Boom", "Peri Peri Pataka"],
                    "tier": "Explorer",
                    "status": "Box sent",
                    "discount_code": "ANANYA15",
                    "code_uses": 7,
                    "collab_fee": 8500,
                    "payout_status": "Pending",
                    "box_tracking": "BD-BLR-882941",
                    "box_carrier": "BlueDart Express",
                    "draft_url": "",
                    "draft_caption": "",
                    "draft_submitted_at": 0,
                    "draft_feedback": "Your flavour box is out for delivery! Remember to film the unboxing & first bite in natural daylight.",
                    "live_post_url": "",
                    "live_story_url": "",
                    "live_views": 0,
                    "posted_at": 0,
                    "admin_notes": "High engagement in Bengaluru foodie community. Fast responder on WhatsApp.",
                    "offset_days": 5,
                },
                {
                    "name": "Rohan Deshmukh",
                    "handle": "@rohanlaughs",
                    "email": "rohan@example.com",
                    "phone": "+91 98201 44556",
                    "city": "Mumbai",
                    "pincode": "400050",
                    "address": "702, Sea Breeze Apts, Chapel Road, Bandra West, Mumbai",
                    "followers": "100K – 500K",
                    "views": "185,000",
                    "niche": ["Comedy & skits", "Food & reviews"],
                    "other_platforms": "youtube.com/@rohanlaughs",
                    "idea": "When Indian parents try 'Guntur chilli × Jamaican jerk' vs 'Black pepper × French herbs' during IPL match night.",
                    "preferred_flavours": ["Guntur Jerk", "Pepper Bonjour", "Masala Fiesta"],
                    "tier": "Ambassador",
                    "status": "Draft received",
                    "discount_code": "ROHAN20",
                    "code_uses": 14,
                    "collab_fee": 35000,
                    "payout_status": "Pending",
                    "box_tracking": "BD-MUM-774120",
                    "box_carrier": "BlueDart Express",
                    "draft_url": "https://drive.google.com/file/d/krispino-rohan-draft-v1/view",
                    "draft_caption": "#ad When Dad discovers Guntur Chilli went on a vacation to Jamaica 🌶️🔥 Trying the new @krispino fusion range! Use code ROHAN20 for 20% off your first box.",
                    "draft_submitted_at": now - 86400 * 1000,
                    "draft_feedback": "Under review by brand team — checking ASCI tag placement in first 3 seconds.",
                    "live_post_url": "",
                    "live_story_url": "",
                    "live_views": 0,
                    "posted_at": 0,
                    "admin_notes": "Anchor Ambassador for December launch week. Draft looks hilarious.",
                    "offset_days": 8,
                },
                {
                    "name": "Meera Nair",
                    "handle": "@meeracooks",
                    "email": "meera@example.com",
                    "phone": "+91 94470 77889",
                    "city": "Kochi",
                    "pincode": "682001",
                    "address": "18, Princess Street, Fort Kochi",
                    "followers": "50K – 100K",
                    "views": "62,000",
                    "niche": ["Food & reviews", "Travel"],
                    "other_platforms": "youtube.com/@meeracookskerala",
                    "idea": "Kanthari chilli meets Japanese wasabi?! Testing Wasa-Boom on banana & tapioca chips with evening sulaimani chai.",
                    "preferred_flavours": ["Wasa-Boom", "OG Salt", "Salsa Masti"],
                    "tier": "Explorer",
                    "status": "Posted",
                    "discount_code": "MEERA15",
                    "code_uses": 42,
                    "collab_fee": 14000,
                    "payout_status": "Paid",
                    "box_tracking": "DLV-KOC-551920",
                    "box_carrier": "Delhivery",
                    "draft_url": "https://drive.google.com/file/d/krispino-meera-final/view",
                    "draft_caption": "#collab Kanthari chilli × Wasabi on crispy tapioca chips?! @krispino nailed the crunch. Grab yours with code MEERA15!",
                    "draft_submitted_at": now - 6 * 86400 * 1000,
                    "draft_feedback": "Approved! Love the close-up crunch audio and clear pack shot.",
                    "live_post_url": "https://instagram.com/reel/C9KrispinoMeera",
                    "live_story_url": "https://instagram.com/stories/meeracooks/3019283",
                    "live_views": 78400,
                    "posted_at": now - 3 * 86400 * 1000,
                    "admin_notes": "Top performing Reel so far. Boosted with ₹5k ad spend.",
                    "offset_days": 12,
                },
                {
                    "name": "Vikramaditya Singh",
                    "handle": "@vikramgaming",
                    "email": "vikram@example.com",
                    "phone": "+91 90001 33445",
                    "city": "Hyderabad",
                    "pincode": "500033",
                    "address": "Plot 88, Road No 36, Jubilee Hills, Hyderabad",
                    "followers": "50K – 100K",
                    "views": "45,000",
                    "niche": ["Sports & gaming", "Comedy & skits"],
                    "other_platforms": "youtube.com/@vikramplayslive",
                    "idea": "1 spicy Wasa-Boom chip for every round my squad loses in Valorant late-night stream.",
                    "preferred_flavours": ["Wasa-Boom", "Guntur Jerk", "Sour Cream Jalwa"],
                    "tier": "Explorer",
                    "status": "Draft approved",
                    "discount_code": "VIKRAM15",
                    "code_uses": 9,
                    "collab_fee": 11000,
                    "payout_status": "Approved",
                    "box_tracking": "BD-HYD-663011",
                    "box_carrier": "BlueDart Express",
                    "draft_url": "https://drive.google.com/file/d/krispino-vikram-cut2/view",
                    "draft_caption": "#ad Every Valorant loss = 1 Guntur Jerk chip from @krispino 🔥 My squad set me up! Use code VIKRAM15.",
                    "draft_submitted_at": now - 2 * 86400 * 1000,
                    "draft_feedback": "Draft approved! You are clear to post this Friday at 7 PM IST. Don't forget to submit the live link here once up.",
                    "live_post_url": "",
                    "live_story_url": "",
                    "live_views": 0,
                    "posted_at": 0,
                    "admin_notes": "Great energy for gaming demographic.",
                    "offset_days": 9,
                },
                {
                    "name": "Kabir Sharma",
                    "handle": "@kabirvlogs",
                    "email": "kabir@example.com",
                    "phone": "+91 98111 22334",
                    "city": "New Delhi",
                    "pincode": "110016",
                    "address": "C-14, Hauz Khas Enclave, New Delhi",
                    "followers": "1K – 10K",
                    "views": "6,800",
                    "niche": ["Student life", "Food & reviews"],
                    "other_platforms": "",
                    "idea": "Hostel 2 AM exam study break: ranking all 9 Krispino flavours with my wingmates.",
                    "preferred_flavours": ["Peri Peri Pataka", "Chilli Ciao", "Sour Cream Jalwa"],
                    "tier": "Taster",
                    "status": "Shortlisted",
                    "discount_code": "KABIR15",
                    "code_uses": 2,
                    "collab_fee": 0,
                    "payout_status": "Barter Box",
                    "box_tracking": "",
                    "box_carrier": "Delhivery",
                    "draft_url": "",
                    "draft_caption": "",
                    "draft_submitted_at": 0,
                    "draft_feedback": "Welcome to the Creator Club! Confirm your hostel delivery address so we can dispatch your box.",
                    "live_post_url": "",
                    "live_story_url": "",
                    "live_views": 0,
                    "posted_at": 0,
                    "admin_notes": "Strong campus micro-creator in Delhi University circuit.",
                    "offset_days": 3,
                },
                {
                    "name": "Priya Patel",
                    "handle": "@priyalifestyle",
                    "email": "priya@example.com",
                    "phone": "+91 98980 55667",
                    "city": "Ahmedabad",
                    "pincode": "380015",
                    "address": "B-401, Shivalik Plaza, Satellite, Ahmedabad",
                    "followers": "10K – 50K",
                    "views": "19,200",
                    "niche": ["Lifestyle", "Family & parenting"],
                    "other_platforms": "",
                    "idea": "Packing a road-trip snack basket to Udaipur featuring Sour Cream Jalwa & Salsa Masti.",
                    "preferred_flavours": ["Sour Cream Jalwa", "Salsa Masti", "Masala Fiesta"],
                    "tier": "Explorer",
                    "status": "New",
                    "discount_code": "PRIYA15",
                    "code_uses": 0,
                    "collab_fee": 6000,
                    "payout_status": "Pending",
                    "box_tracking": "",
                    "box_carrier": "BlueDart Express",
                    "draft_url": "",
                    "draft_caption": "",
                    "draft_submitted_at": 0,
                    "draft_feedback": "",
                    "live_post_url": "",
                    "live_story_url": "",
                    "live_views": 0,
                    "posted_at": 0,
                    "admin_notes": "",
                    "offset_days": 1,
                },
            ]

            for item in seed_creators:
                created_ts = now - item["offset_days"] * 86400 * 1000
                cur = conn.execute(
                    "INSERT INTO users (email, password_hash, role, name, created_at) VALUES (?, ?, 'influencer', ?, ?)",
                    (item["email"].lower(), hash_password("creator123"), item["name"], created_ts),
                )
                uid = cur.lastrowid
                conn.execute(
                    """
                    INSERT INTO creators (
                        user_id, name, handle, email, phone, city, pincode, address,
                        followers, views, niche_json, other_platforms, idea, preferred_flavours_json,
                        tier, status, discount_code, code_uses, collab_fee, payout_status,
                        box_tracking, box_carrier, draft_url, draft_caption, draft_submitted_at,
                        draft_feedback, live_post_url, live_story_url, live_views, posted_at,
                        admin_notes, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        uid,
                        item["name"],
                        item["handle"],
                        item["email"].lower(),
                        item["phone"],
                        item["city"],
                        item["pincode"],
                        item["address"],
                        item["followers"],
                        item["views"],
                        json.dumps(item["niche"]),
                        item["other_platforms"],
                        item["idea"],
                        json.dumps(item["preferred_flavours"]),
                        item["tier"],
                        item["status"],
                        item["discount_code"],
                        item["code_uses"],
                        item["collab_fee"],
                        item["payout_status"],
                        item["box_tracking"],
                        item["box_carrier"],
                        item["draft_url"],
                        item["draft_caption"],
                        item["draft_submitted_at"],
                        item["draft_feedback"],
                        item["live_post_url"],
                        item["live_story_url"],
                        item["live_views"],
                        item["posted_at"],
                        item["admin_notes"],
                        created_ts,
                        now,
                    ),
                )
    conn.close()


def serialize_creator(row: sqlite3.Row) -> dict:
    d = dict(row)
    try:
        d["niche"] = json.loads(d.pop("niche_json", "[]"))
    except Exception:
        d["niche"] = []
    try:
        d["preferred_flavours"] = json.loads(d.pop("preferred_flavours_json", "[]"))
    except Exception:
        d["preferred_flavours"] = []
    return d


class KrispinoHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        # Clean concise server logs
        pass

    def _send_json(self, data: dict | list, status: int = 200) -> None:
        raw = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def _get_auth_user(self, conn: sqlite3.Connection) -> dict | None:
        auth_header = self.headers.get("Authorization", "")
        token = ""
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        if not token:
            return None
        now = int(time.time() * 1000)
        row = conn.execute(
            """
            SELECT u.id, u.email, u.role, u.name
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ? AND s.expires_at > ?
            """,
            (token, now),
        ).fetchone()
        return dict(row) if row else None

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/meta":
            self._send_json({"statuses": STATUSES, "tiers": TIERS, "flavours": FLAVOURS})
            return

        if path == "/api/auth/me":
            conn = get_db()
            try:
                user = self._get_auth_user(conn)
                if not user:
                    self._send_json({"error": "Not authenticated"}, 401)
                    return
                creator_data = None
                if user["role"] == "influencer":
                    crow = conn.execute("SELECT * FROM creators WHERE user_id = ? OR LOWER(email) = ?", (user["id"], user["email"].lower())).fetchone()
                    if crow:
                        creator_data = serialize_creator(crow)
                self._send_json({"user": user, "creator": creator_data})
            finally:
                conn.close()
            return

        if path == "/api/influencer/dashboard":
            conn = get_db()
            try:
                user = self._get_auth_user(conn)
                if not user or user["role"] != "influencer":
                    self._send_json({"error": "Influencer authentication required"}, 401)
                    return
                crow = conn.execute("SELECT * FROM creators WHERE user_id = ? OR LOWER(email) = ?", (user["id"], user["email"].lower())).fetchone()
                if not crow:
                    self._send_json({"error": "Creator profile not found"}, 404)
                    return
                self._send_json({"creator": serialize_creator(crow), "flavours": FLAVOURS})
            finally:
                conn.close()
            return

        if path == "/api/admin/applications":
            conn = get_db()
            try:
                user = self._get_auth_user(conn)
                if not user or user["role"] != "admin":
                    self._send_json({"error": "Admin authentication required"}, 401)
                    return

                qs = parse_qs(parsed.query)
                status_filter = (qs.get("status", [""])[0] or "").strip()
                tier_filter = (qs.get("tier", [""])[0] or "").strip()
                search_q = (qs.get("q", [""])[0] or "").strip().lower()

                rows = conn.execute("SELECT * FROM creators ORDER BY created_at DESC").fetchall()
                all_creators = [serialize_creator(r) for r in rows]

                # Calculate global KPIs across all applications
                kpis = {
                    "total": len(all_creators),
                    "new_count": sum(1 for c in all_creators if c["status"] == "New"),
                    "shortlisted": sum(1 for c in all_creators if c["status"] in ("Shortlisted", "Box sent", "Draft received", "Draft approved", "Posted")),
                    "boxes_sent": sum(1 for c in all_creators if c["status"] in ("Box sent", "Draft received", "Draft approved", "Posted") or c["box_tracking"]),
                    "drafts_pending": sum(1 for c in all_creators if c["status"] == "Draft received"),
                    "posted": sum(1 for c in all_creators if c["status"] == "Posted"),
                    "total_views": sum(int(c.get("live_views") or 0) for c in all_creators),
                    "total_code_uses": sum(int(c.get("code_uses") or 0) for c in all_creators),
                    "total_budget": sum(int(c.get("collab_fee") or 0) for c in all_creators if c["status"] != "Not a fit"),
                }

                filtered = all_creators
                if status_filter:
                    filtered = [c for c in filtered if c["status"] == status_filter]
                if tier_filter:
                    filtered = [c for c in filtered if c["tier"] == tier_filter]
                if search_q:
                    filtered = [
                        c
                        for c in filtered
                        if search_q in c["name"].lower()
                        or search_q in c["handle"].lower()
                        or search_q in c["city"].lower()
                        or search_q in c["email"].lower()
                        or search_q in (c.get("discount_code") or "").lower()
                        or any(search_q in n.lower() for n in c["niche"])
                    ]

                self._send_json({"applications": filtered, "kpis": kpis, "statuses": STATUSES, "tiers": TIERS})
            finally:
                conn.close()
            return

        if path == "/api/admin/export.csv":
            conn = get_db()
            try:
                user = self._get_auth_user(conn)
                if not user or user["role"] != "admin":
                    self._send_json({"error": "Admin authentication required"}, 401)
                    return
                rows = conn.execute("SELECT * FROM creators ORDER BY created_at DESC").fetchall()
                buf = io.StringIO()
                writer = csv.writer(buf)
                writer.writerow(
                    [
                        "ID",
                        "Name",
                        "Instagram Handle",
                        "Email",
                        "WhatsApp",
                        "City",
                        "Pincode",
                        "Followers",
                        "Avg Views",
                        "Tier",
                        "Status",
                        "Discount Code",
                        "Code Uses",
                        "Collab Fee (INR)",
                        "Payout Status",
                        "Box Tracking",
                        "Draft URL",
                        "Live Post URL",
                        "Live Views",
                        "Niches",
                        "Preferred Flavours",
                        "Content Idea",
                    ]
                )
                for r in rows:
                    c = serialize_creator(r)
                    writer.writerow(
                        [
                            c["id"],
                            c["name"],
                            c["handle"],
                            c["email"],
                            c["phone"],
                            c["city"],
                            c["pincode"],
                            c["followers"],
                            c["views"],
                            c["tier"],
                            c["status"],
                            c["discount_code"],
                            c["code_uses"],
                            c["collab_fee"],
                            c["payout_status"],
                            c["box_tracking"],
                            c["draft_url"],
                            c["live_post_url"],
                            c["live_views"],
                            ", ".join(c["niche"]),
                            ", ".join(c["preferred_flavours"]),
                            c["idea"],
                        ]
                    )
                csv_bytes = buf.getvalue().encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", 'attachment; filename="krispino-creators-export.csv"')
                self.send_header("Content-Length", str(len(csv_bytes)))
                self.end_headers()
                self.wfile.write(csv_bytes)
            finally:
                conn.close()
            return

        # Serve static files
        self._serve_static(path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_json()

        if path == "/api/auth/login":
            identifier = (body.get("identifier") or body.get("email") or "").strip().lower()
            password = body.get("password") or ""
            if not identifier or not password:
                self._send_json({"error": "Please enter both your email/handle and password."}, 400)
                return

            conn = get_db()
            try:
                user_row = conn.execute("SELECT * FROM users WHERE LOWER(email) = ?", (identifier,)).fetchone()
                if not user_row:
                    # Also allow login by Instagram handle for creators
                    handle_lookup = identifier if identifier.startswith("@") else f"@{identifier}"
                    crow = conn.execute("SELECT user_id, email FROM creators WHERE LOWER(handle) = ?", (handle_lookup,)).fetchone()
                    if crow and crow["user_id"]:
                        user_row = conn.execute("SELECT * FROM users WHERE id = ?", (crow["user_id"],)).fetchone()

                if not user_row or not verify_password(password, user_row["password_hash"]):
                    self._send_json({"error": "Invalid credentials. Try one of the demo accounts or check your password."}, 401)
                    return

                token = secrets.token_urlsafe(32)
                now = int(time.time() * 1000)
                expires = now + 14 * 86400 * 1000
                with conn:
                    conn.execute(
                        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                        (token, user_row["id"], now, expires),
                    )

                creator_data = None
                if user_row["role"] == "influencer":
                    crow = conn.execute("SELECT * FROM creators WHERE user_id = ? OR LOWER(email) = ?", (user_row["id"], user_row["email"].lower())).fetchone()
                    if crow:
                        creator_data = serialize_creator(crow)

                self._send_json(
                    {
                        "token": token,
                        "user": {
                            "id": user_row["id"],
                            "email": user_row["email"],
                            "role": user_row["role"],
                            "name": user_row["name"],
                        },
                        "creator": creator_data,
                    }
                )
            finally:
                conn.close()
            return

        if path == "/api/auth/logout":
            auth_header = self.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:].strip()
                conn = get_db()
                try:
                    with conn:
                        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
                finally:
                    conn.close()
            self._send_json({"ok": True})
            return

        if path == "/api/applications":
            name = (body.get("name") or "").strip()
            handle = (body.get("handle") or "").strip()
            email = (body.get("email") or "").strip().lower()
            phone = (body.get("phone") or "").strip()
            city = (body.get("city") or "").strip()
            pincode = (body.get("pincode") or "").strip()
            address = (body.get("address") or "").strip()
            followers = (body.get("followers") or "").strip()
            views = (body.get("views") or "").strip()
            niche = body.get("niche") if isinstance(body.get("niche"), list) else []
            other = (body.get("other") or "").strip()
            idea = (body.get("idea") or "").strip()
            preferred_flavours = body.get("preferred_flavours") if isinstance(body.get("preferred_flavours"), list) else []
            password = body.get("password") or "creator123"

            if not all([name, handle, email, phone, city, pincode, followers, idea]) or not niche:
                self._send_json({"error": "Please complete all required application fields."}, 400)
                return

            if not handle.startswith("@"):
                handle = f"@{handle}"

            tier = infer_tier(followers)
            discount_code = generate_discount_code(name, handle)
            default_fee = 0 if tier == "Taster" else (8000 if tier == "Explorer" else 25000)
            payout_status = "Barter Box" if tier == "Taster" else "Pending"
            now = int(time.time() * 1000)

            conn = get_db()
            try:
                existing_user = conn.execute("SELECT id, role FROM users WHERE LOWER(email) = ?", (email,)).fetchone()
                if existing_user and existing_user["role"] == "admin":
                    self._send_json({"error": "This email belongs to an admin account. Please use a creator email."}, 400)
                    return

                with conn:
                    if existing_user:
                        uid = existing_user["id"]
                        if body.get("password"):
                            conn.execute("UPDATE users SET password_hash = ?, name = ? WHERE id = ?", (hash_password(password), name, uid))
                    else:
                        cur = conn.execute(
                            "INSERT INTO users (email, password_hash, role, name, created_at) VALUES (?, ?, 'influencer', ?, ?)",
                            (email, hash_password(password), name, now),
                        )
                        uid = cur.lastrowid

                    existing_creator = conn.execute("SELECT id FROM creators WHERE user_id = ? OR LOWER(email) = ?", (uid, email)).fetchone()
                    if existing_creator:
                        cid = existing_creator["id"]
                        conn.execute(
                            """
                            UPDATE creators
                            SET user_id = ?, name = ?, handle = ?, phone = ?, city = ?, pincode = ?, address = ?,
                                followers = ?, views = ?, niche_json = ?, other_platforms = ?, idea = ?,
                                preferred_flavours_json = ?, tier = ?, updated_at = ?
                            WHERE id = ?
                            """,
                            (
                                uid,
                                name,
                                handle,
                                phone,
                                city,
                                pincode,
                                address,
                                followers,
                                views,
                                json.dumps(niche),
                                other,
                                idea,
                                json.dumps(preferred_flavours),
                                tier,
                                now,
                                cid,
                            ),
                        )
                    else:
                        cur = conn.execute(
                            """
                            INSERT INTO creators (
                                user_id, name, handle, email, phone, city, pincode, address,
                                followers, views, niche_json, other_platforms, idea, preferred_flavours_json,
                                tier, status, discount_code, collab_fee, payout_status, created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?, ?, ?, ?, ?)
                            """,
                            (
                                uid,
                                name,
                                handle,
                                email,
                                phone,
                                city,
                                pincode,
                                address,
                                followers,
                                views,
                                json.dumps(niche),
                                other,
                                idea,
                                json.dumps(preferred_flavours),
                                tier,
                                discount_code,
                                default_fee,
                                payout_status,
                                now,
                                now,
                            ),
                        )
                        cid = cur.lastrowid

                    token = secrets.token_urlsafe(32)
                    conn.execute(
                        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                        (token, uid, now, now + 14 * 86400 * 1000),
                    )

                crow = conn.execute("SELECT * FROM creators WHERE id = ?", (cid,)).fetchone()
                self._send_json(
                    {
                        "token": token,
                        "user": {"id": uid, "email": email, "role": "influencer", "name": name},
                        "creator": serialize_creator(crow),
                    },
                    201,
                )
            finally:
                conn.close()
            return

        if path == "/api/influencer/draft":
            conn = get_db()
            try:
                user = self._get_auth_user(conn)
                if not user or user["role"] != "influencer":
                    self._send_json({"error": "Influencer authentication required"}, 401)
                    return
                draft_url = (body.get("draft_url") or "").strip()
                draft_caption = (body.get("draft_caption") or "").strip()
                if not draft_url:
                    self._send_json({"error": "Please provide a link to your draft video (Google Drive, Dropbox, Frame.io, etc.)."}, 400)
                    return
                if not any(tag in draft_caption.lower() for tag in ("#ad", "#collab", "#krispinopartner")):
                    self._send_json({"error": "ASCI disclosure required: include #ad, #collab, or #KrispinoPartner in your draft caption."}, 400)
                    return

                now = int(time.time() * 1000)
                with conn:
                    conn.execute(
                        """
                        UPDATE creators
                        SET draft_url = ?, draft_caption = ?, draft_submitted_at = ?,
                            status = CASE WHEN status IN ('New', 'Shortlisted', 'Box sent', 'Draft received') THEN 'Draft received' ELSE status END,
                            updated_at = ?
                        WHERE user_id = ? OR LOWER(email) = ?
                        """,
                        (draft_url, draft_caption, now, now, user["id"], user["email"].lower()),
                    )
                crow = conn.execute("SELECT * FROM creators WHERE user_id = ? OR LOWER(email) = ?", (user["id"], user["email"].lower())).fetchone()
                self._send_json({"creator": serialize_creator(crow)})
            finally:
                conn.close()
            return

        if path == "/api/influencer/post":
            conn = get_db()
            try:
                user = self._get_auth_user(conn)
                if not user or user["role"] != "influencer":
                    self._send_json({"error": "Influencer authentication required"}, 401)
                    return
                live_post_url = (body.get("live_post_url") or "").strip()
                live_story_url = (body.get("live_story_url") or "").strip()
                live_views = int(body.get("live_views") or 0)
                if not live_post_url:
                    self._send_json({"error": "Please enter the live Instagram Reel URL."}, 400)
                    return
                now = int(time.time() * 1000)
                with conn:
                    conn.execute(
                        """
                        UPDATE creators
                        SET live_post_url = ?, live_story_url = ?, live_views = ?, posted_at = ?,
                            status = 'Posted', updated_at = ?
                        WHERE user_id = ? OR LOWER(email) = ?
                        """,
                        (live_post_url, live_story_url, live_views, now, now, user["id"], user["email"].lower()),
                    )
                crow = conn.execute("SELECT * FROM creators WHERE user_id = ? OR LOWER(email) = ?", (user["id"], user["email"].lower())).fetchone()
                self._send_json({"creator": serialize_creator(crow)})
            finally:
                conn.close()
            return

        if path == "/api/admin/applications":
            conn = get_db()
            try:
                user = self._get_auth_user(conn)
                if not user or user["role"] != "admin":
                    self._send_json({"error": "Admin authentication required"}, 401)
                    return
                name = (body.get("name") or "").strip()
                handle = (body.get("handle") or "").strip()
                email = (body.get("email") or "").strip().lower()
                phone = (body.get("phone") or "").strip()
                city = (body.get("city") or "").strip()
                pincode = (body.get("pincode") or "").strip()
                followers = (body.get("followers") or "10K – 50K").strip()
                views = (body.get("views") or "").strip()
                niche = body.get("niche") if isinstance(body.get("niche"), list) else ["Food & reviews"]
                idea = (body.get("idea") or "Logged manually by Admin team").strip()
                tier = (body.get("tier") or infer_tier(followers)).strip()
                status = (body.get("status") or "Shortlisted").strip()
                collab_fee = int(body.get("collab_fee") or 0)

                if not name or not handle or not email:
                    self._send_json({"error": "Name, Instagram handle, and email are required."}, 400)
                    return
                if not handle.startswith("@"):
                    handle = f"@{handle}"
                discount_code = (body.get("discount_code") or generate_discount_code(name, handle)).strip().upper()
                now = int(time.time() * 1000)

                with conn:
                    u_row = conn.execute("SELECT id FROM users WHERE LOWER(email) = ?", (email,)).fetchone()
                    if u_row:
                        uid = u_row["id"]
                    else:
                        cur = conn.execute(
                            "INSERT INTO users (email, password_hash, role, name, created_at) VALUES (?, ?, 'influencer', ?, ?)",
                            (email, hash_password("creator123"), name, now),
                        )
                        uid = cur.lastrowid

                    cur = conn.execute(
                        """
                        INSERT INTO creators (
                            user_id, name, handle, email, phone, city, pincode, followers, views,
                            niche_json, idea, tier, status, discount_code, collab_fee, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            uid,
                            name,
                            handle,
                            email,
                            phone,
                            city or "Bengaluru",
                            pincode or "560001",
                            followers,
                            views,
                            json.dumps(niche),
                            idea,
                            tier,
                            status,
                            discount_code,
                            collab_fee,
                            now,
                            now,
                        ),
                    )
                    cid = cur.lastrowid

                crow = conn.execute("SELECT * FROM creators WHERE id = ?", (cid,)).fetchone()
                self._send_json({"creator": serialize_creator(crow)}, 201)
            finally:
                conn.close()
            return

        self._send_json({"error": "Not found"}, 404)

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_json()

        if path == "/api/influencer/profile":
            conn = get_db()
            try:
                user = self._get_auth_user(conn)
                if not user or user["role"] != "influencer":
                    self._send_json({"error": "Influencer authentication required"}, 401)
                    return
                crow = conn.execute("SELECT * FROM creators WHERE user_id = ? OR LOWER(email) = ?", (user["id"], user["email"].lower())).fetchone()
                if not crow:
                    self._send_json({"error": "Creator profile not found"}, 404)
                    return

                current = serialize_creator(crow)
                phone = (body.get("phone") if "phone" in body else current["phone"]).strip()
                city = (body.get("city") if "city" in body else current["city"]).strip()
                pincode = (body.get("pincode") if "pincode" in body else current["pincode"]).strip()
                address = (body.get("address") if "address" in body else current["address"]).strip()
                idea = (body.get("idea") if "idea" in body else current["idea"]).strip()
                other = (body.get("other_platforms") if "other_platforms" in body else current["other_platforms"]).strip()
                pref = body.get("preferred_flavours") if "preferred_flavours" in body else current["preferred_flavours"]
                if not isinstance(pref, list):
                    pref = current["preferred_flavours"]

                now = int(time.time() * 1000)
                with conn:
                    conn.execute(
                        """
                        UPDATE creators
                        SET phone = ?, city = ?, pincode = ?, address = ?, idea = ?,
                            other_platforms = ?, preferred_flavours_json = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (phone, city, pincode, address, idea, other, json.dumps(pref[:3]), now, current["id"]),
                    )
                updated = conn.execute("SELECT * FROM creators WHERE id = ?", (current["id"],)).fetchone()
                self._send_json({"creator": serialize_creator(updated)})
            finally:
                conn.close()
            return

        m = re.match(r"^/api/admin/applications/(\d+)$", path)
        if m:
            cid = int(m.group(1))
            conn = get_db()
            try:
                user = self._get_auth_user(conn)
                if not user or user["role"] != "admin":
                    self._send_json({"error": "Admin authentication required"}, 401)
                    return
                crow = conn.execute("SELECT * FROM creators WHERE id = ?", (cid,)).fetchone()
                if not crow:
                    self._send_json({"error": "Creator not found"}, 404)
                    return

                current = serialize_creator(crow)
                status = body.get("status", current["status"])
                tier = body.get("tier", current["tier"])
                discount_code = (body.get("discount_code", current["discount_code"]) or "").strip().upper()
                code_uses = int(body.get("code_uses", current["code_uses"]) or 0)
                collab_fee = int(body.get("collab_fee", current["collab_fee"]) or 0)
                payout_status = body.get("payout_status", current["payout_status"])
                box_tracking = (body.get("box_tracking", current["box_tracking"]) or "").strip()
                box_carrier = (body.get("box_carrier", current["box_carrier"]) or "BlueDart Express").strip()
                draft_feedback = (body.get("draft_feedback", current["draft_feedback"]) or "").strip()
                admin_notes = (body.get("admin_notes", current["admin_notes"]) or "").strip()
                live_views = int(body.get("live_views", current["live_views"]) or 0)
                preferred_flavours = body.get("preferred_flavours", current["preferred_flavours"])
                if not isinstance(preferred_flavours, list):
                    preferred_flavours = current["preferred_flavours"]

                now = int(time.time() * 1000)
                with conn:
                    conn.execute(
                        """
                        UPDATE creators
                        SET status = ?, tier = ?, discount_code = ?, code_uses = ?,
                            collab_fee = ?, payout_status = ?, box_tracking = ?, box_carrier = ?,
                            draft_feedback = ?, admin_notes = ?, live_views = ?,
                            preferred_flavours_json = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            status,
                            tier,
                            discount_code,
                            code_uses,
                            collab_fee,
                            payout_status,
                            box_tracking,
                            box_carrier,
                            draft_feedback,
                            admin_notes,
                            live_views,
                            json.dumps(preferred_flavours),
                            now,
                            cid,
                        ),
                    )
                updated = conn.execute("SELECT * FROM creators WHERE id = ?", (cid,)).fetchone()
                self._send_json({"creator": serialize_creator(updated)})
            finally:
                conn.close()
            return

        self._send_json({"error": "Not found"}, 404)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        m = re.match(r"^/api/admin/applications/(\d+)$", parsed.path)
        if m:
            cid = int(m.group(1))
            conn = get_db()
            try:
                user = self._get_auth_user(conn)
                if not user or user["role"] != "admin":
                    self._send_json({"error": "Admin authentication required"}, 401)
                    return
                with conn:
                    conn.execute("DELETE FROM creators WHERE id = ?", (cid,))
                self._send_json({"ok": True})
            finally:
                conn.close()
            return
        self._send_json({"error": "Not found"}, 404)

    def _serve_static(self, req_path: str) -> None:
        if req_path in ("/", "/index.html"):
            file_path = os.path.join(STATIC_DIR, "index.html")
        else:
            safe_rel = os.path.normpath(req_path.lstrip("/"))
            if safe_rel.startswith(".."):
                self._send_json({"error": "Forbidden"}, 403)
                return
            file_path = os.path.join(STATIC_DIR, safe_rel)

        if not os.path.isfile(file_path):
            # SPA fallback to index.html
            file_path = os.path.join(STATIC_DIR, "index.html")
            if not os.path.isfile(file_path):
                self._send_json({"error": "Static file not found"}, 404)
                return

        ctype, _ = mimetypes.guess_type(file_path)
        if not ctype:
            ctype = "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"

        with open(file_path, "rb") as f:
            content = f.read()

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


def run_server(port: int = 8000) -> None:
    init_db()
    server = ThreadingHTTPServer(("127.0.0.1", port), KrispinoHandler)
    print(f"Krispino Creator Club server running at http://127.0.0.1:{port}")
    print("  Admin Login:      admin@krispino.in  /  Krispino@2026")
    print("  Influencer Demo:  ananya@example.com /  creator123  (or @ananyaeats, @rohanlaughs, @meeracooks)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        server.server_close()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    run_server(port)
