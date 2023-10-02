require("dotenv").config();
const multer = require("multer");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const File = require("./models/File");
const path = require("path");
const fs = require("fs");
const { encryptId, decryptId } = require("./utili/enc"); // Add the path to your encryption.js file

const port = 4000;
const express = require("express");
const app = express();
app.use(express.urlencoded({ extended: true }));

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    //some work
    cb(null, "uploads");
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.originalname.replace(/\.[^/.]+$/, "") +
        "_" +
        Date.now() +
        path.extname(file.originalname)
    );
  },
});

let maxSize = 1024 * 1024 *  5;

let upload = multer({
  storage: storage,
  limits: {
    fileSize: maxSize,
  },
  fileFilter: function (req, file, cb) {
    console.log(file.mimetype);
    let filetypes = /jpeg|jpg|png|gif|pdf|zip|docx|doc|mp4|mp3/;
    let mimetype = filetypes.test(file.mimetype);
    let extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }

    cb(
      "Error: File upload only supports the following filetypes: " + filetypes
    );
  },
}).array("file");

mongoose.set("strictQuery", false);

mongoose.connect(
  process.env.DATABASE_URL,
  { useNewUrlParser: true, useUnifiedTopology: true },
  (err) => {
    if (!err) {
      console.log("db connected");
    } else {
      console.log(err);
    }
  }
);

app.set("view engine", "ejs");

app.get("/", (req, res) => {
  return res.render("index");
}); // ...

app.post("/upload", async (req, res, next) => {
  try {
    upload(req, res, async (err) => {
      if (err) {
        if (
          err instanceof multer.MulterError &&
          err.code == "LIMIT_FILE_SIZE"
        ) {
          return res.send("File size is maximum 2mb");
        }

        return res.send(err);
      } else {
        const files = req.files; // Access uploaded files as an array
        const fileLinks = [];

        // Process each uploaded file
        for (const file of files) {
          const fileData = new File({
            path: file.path,
            originalName: file.originalname,
          });

          if (req.body.password != null && req.body.password !== "") {
            fileData.password = await bcrypt.hash(req.body.password, 10);
          }

          const savedFile = await fileData.save();
          const encryptedId = encryptId(savedFile.id);

          // Calculate the expiration time based on user input
          const customExpiration = parseInt(req.body.expiration);
          const expirationUnit = req.body.expirationUnit;
          const expirationInMilliseconds =
            customExpiration *
            (expirationUnit === "hours"
              ? 60 * 60 * 1000
              : expirationUnit === "days"
              ? 24 * 60 * 60 * 1000
              : 60 * 1000);

          const timestamp = Date.now();

          // Calculate the actual expiration time
          const expirationTime = timestamp + expirationInMilliseconds;

          // Generate the file link for this file
          const fileLink = `${req.headers.origin}/file/${encryptedId}?expires=${expirationTime}`;

          // Push the file link to the array
          fileLinks.push(fileLink);
        }

        // Render the response with the array of file links
        res.render("index", {
          fileLinks: fileLinks,
        });
      }
    });
  } catch (error) {
    // Handle any unexpected errors here
    console.error("Error:", error);
    return res.status(500).send("Internal Server Error");
  }
});

// ...

app.route("/file/:id").get((req, res) => {
  // ... (existing code)

  // Retrieve the custom expiration unit from the query parameter
  const customExpirationUnit = req.query.expirationUnit;

  // ... (existing code)

  async function handleDownload(req, res) {
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

    console.log(file.downloadCount);

    res.download(file.path, file.originalName, (err) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .send({ message: "An error occurred while downloading the file." });
      }
    });
  }

  // Call the handleDownload function with the customExpirationUnit
  handleDownload(req, res);
});
app.route("/file/:id").post(async (req, res) => {
  // ... (existing code)

  // Retrieve the custom expiration unit from the query parameter
  const customExpirationUnit = req.query.expirationUnit;

  // ... (existing code)

  async function handleDownload(req, res) {
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

    console.log(file.downloadCount);

    res.download(file.path, file.originalName, (err) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .send({ message: "An error occurred while downloading the file." });
      }
    });
  }

  // Call the handleDownload function with the customExpirationUnit
  handleDownload(req, res);
});

app.listen(process.env.PORT || port, (req, res) => {
  console.log(`server started on port ${port}`);
});
