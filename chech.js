// ... (existing code)

app.post("/upload", async (req, res) => {
  try {
    upload(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).send("File size is too large. Maximum allowed is 2MB");
        }
        return res.status(500).send(err.message || "Internal Server Error");
      }

      // ... (rest of the existing code)

      // Calculate expiration time
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

      // ... (rest of the existing code)
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).send("Internal Server Error");
  }
});

// ... (existing code)
