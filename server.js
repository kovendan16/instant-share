require("dotenv").config();
const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { encryptId, decryptId } = require("./utili/enc");
const File = require("./models/File");
const path = require("path");

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(express.urlencoded({ extended: true }));

// Multer configuration for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads");
  },
  filename: (req, file, cb) => {
    cb(
      null,
      file.originalname.replace(/\.[^/.]+$/, "") +
        "_" +
        Date.now() +
        path.extname(file.originalname)
    );
  },
});

const maxSize = 1024 * 1024 * 1024 * 8;

const upload = multer({
  storage: storage,
  limits: {
    fileSize: maxSize,
  },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|pdf|zip|docx|doc|mp4|mp3|webm/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    }

    return cb(
      "Error: File upload only supports the following filetypes: " + filetypes
    );
  },
}).array("file");

// Database connection
mongoose.connect(
  process.env.DATABASE_URL,
  { useNewUrlParser: true, useUnifiedTopology: true },
  (err) => {
    if (err) {
      console.error("Error connecting to the database:", err);
    } else {
      console.log("Database connected successfully");
    }
  }
);

// Set view engine
app.set("view engine", "ejs");

// Routes
app.get("/", (req, res) => {
  return res.render("index");
});

app.post("/upload", async (req, res) => {
  try {
    upload(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).send("File size is too large. Maximum allowed is 2MB");
        }
        return res.status(500).send(err.message || "Internal Server Error");
      }

      const customExpiration = parseInt(req.body.expiration);

      if (isNaN(customExpiration)) {
        return res.status(400).send("Invalid expiration value");
      }

      const expirationUnit = req.body.expirationUnit || "minutes";
      const validUnits = ["minutes", "hours", "days"];

      if (!validUnits.includes(expirationUnit)) {
        return res.status(400).send("Invalid expiration unit");
      }

      const expirationInMilliseconds =
        customExpiration *
        (expirationUnit === "hours"
          ? 60 * 60 * 1000
          : expirationUnit === "days"
          ? 24 * 60 * 60 * 1000
          : 60 * 1000);

      const files = req.files;
      const fileLinks = [];

      for (const file of files) {
        const fileData = new File({
          path: encryptId(file.path),
          originalName: encryptId(file.originalname),
        });

        if (req.body.password != null && req.body.password !== "") {
          fileData.password = await bcrypt.hash(req.body.password, 10);
        }

        const savedFile = await fileData.save();
        const encryptedId = encryptId(savedFile.id);

        const timestamp = Date.now();
        const expirationTime = timestamp + expirationInMilliseconds;

        const fileLink = `${req.headers.origin}/file/${encryptedId}?expires=${expirationTime}`;
        fileLinks.push(fileLink);

        setTimeout(async () => {
          await File.findByIdAndRemove(savedFile._id);
        }, expirationInMilliseconds);
      }

      return res.render("index", {
        fileLinks: fileLinks,
      });
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).send("Internal Server Error");
  }
});

app.route("/file/:id").get(async (req, res) => {
  try {
    const decryptedId = decryptId(req.params.id);
    const file = await File.findById(decryptedId);

    const expirationTime = parseInt(req.query.expires, 10);

    if (!expirationTime || Date.now() > expirationTime) {
      return res.status(403).render("expired");
    }

    if (file && file.password) {
      if (!req.query.password) {
        return res.render("password");
      }

      const passwordMatch = await bcrypt.compare(req.query.password, file.password);

      if (!passwordMatch) {
        return res.render("password", { error: true });
      }
    }

    file.downloadCount++;

    const decryptedOriginalName = decryptId(file.originalName);
    const decryptedpath = decryptId(file.path);

    res.download(decryptedpath, decryptedOriginalName, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send({ message: "An error occurred while downloading the file." });
      }
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).send("Internal Server Error");
  }
});

app.route("/file/:id").post(async (req, res) => {
  try {
    const decryptedId = decryptId(req.params.id);
    const file = await File.findById(decryptedId);

    const expirationTime = parseInt(req.query.expires, 10);

    if (!expirationTime || Date.now() > expirationTime) {
      return res.status(403).send({ message: "The link has expired." });
    }

    if (file.password != null) {
      if (req.body.password == null) {
        res.render("password");
        return;
      }

      if (!(await bcrypt.compare(req.body.password, file.password))) {
        res.render("password", { error: true });
        return;
      }
    }

    file.downloadCount++;

    const decryptedOriginalName = decryptId(file.originalName);
    const decryptedpath = decryptId(file.path);

    res.download(decryptedpath, decryptedOriginalName, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send({ message: "An error occurred while downloading the file." + err });
      }
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).send("Internal Server Error");
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
