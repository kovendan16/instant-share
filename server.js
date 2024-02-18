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

const maxSize = 1024 * 1024 * 1024 * 128;

const upload = multer({
  storage: storage,
  limits: {
    fileSize: maxSize,
  },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf|gif|zip|docx|doc|mp4|mp3|webm|exe/;
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
/*const encryptPathId = (pathId) => {
  // Implement your encryption logic here
  // Replace the following line with your actual encryption code
  return pathId;
};
*/
app.post("/upload", async (req, res) => {
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
            path: encryptId(file.path),
            originalName: encryptId(file.originalname),
          });

          if (req.body.password != null && req.body.password !== "") {
            fileData.password = await bcrypt.hash(req.body.password, 10);
          }

          const savedFile = await fileData.save();
          const encryptedId = encryptId(savedFile.id);

          // Calculate the expiration time based on user input
          const customExpiration = parseInt(req.body.expiration);
          const expirationUnit = req.body.expirationUnit || "minutes";
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

          // Schedule a task to delete the data after the expiration time
          setTimeout(async () => {
            await File.findByIdAndRemove(savedFile._id);
          }, expirationInMilliseconds);
        }

        // Render the response with the array of file links
        return res.render("index", {
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

// ... (existing code)

app.route("/file/:id").get(async (req, res) => {
  try {
    const decryptedId = decryptId(req.params.id);
    const file = await File.findById(decryptedId);

    const expirationTime = parseInt(req.query.expires, 10);

    if (!expirationTime || Date.now() > expirationTime) {
      return res.status(403).render("expired");
    }

    // Check if the file is password protected
    if (file && file.password) {
      // If no password provided in the request, render the password input form
      if (!req.query.password) {
        return res.render("password");
      }

      // Compare the provided password with the hashed password stored in the database
      const passwordMatch = await bcrypt.compare(
        req.query.password,
        file.password
      );

      // If the password doesn't match, render the password input form with an error
      if (!passwordMatch) {
        return res.render("password", { error: true });
      }
    }

    // Increment the download count for the file
    file.downloadCount++;

    // Decrypt the original name and file path
    const decryptedOriginalName = decryptId(file.originalName);
    const decryptedpath = decryptId(file.path);

    // Use res.download to initiate the file download
    res.download(decryptedpath, decryptedOriginalName, (err) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .send({ message: "An error occurred while downloading the file." });
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

    // Use res.download to initiate the file download
    res.download(decryptedpath, decryptedOriginalName, (err) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .send({ message: "An error occurred while downloading the file."+err });
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
