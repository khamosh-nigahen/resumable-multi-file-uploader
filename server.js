const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const busboy = require("busboy");
const { promisify } = require("util");
const PORT = 3000;

const app = express();

// app.use(express.static('public'))
app.use(express.json());
app.use(cors());

const getFilePath = (fileName, fileId) =>
    `./uploads/file-${fileId}-${fileName}`;

const getFileDetails = promisify(fs.stat);

app.post("/upload", (req, res) => {
    const contentRange = req.headers["content-range"]; // express turns the headers in the lower case
    const fileId = req.headers["x-file-id"];
    console.log(`fileID: ${fileId}`);

    if (!contentRange) {
        return res.status(400).send({ error: "Missing content range" });
    }

    if (!fileId) {
        return res.status(400).send({ error: "Missing fileId" });
    }

    const match = contentRange.match(/bytes=(\d+)-(\d+)\/(\d+)/);

    if (!match) {
        return res
            .status(400)
            .json({ message: 'Invalid "Content-Range" Format' });
    }

    const rangeStart = Number(match[1]);
    const rangeEnd = Number(match[2]);
    const fileSize = Number(match[3]);

    if (
        rangeStart >= fileSize ||
        rangeStart >= rangeEnd ||
        rangeEnd > fileSize
    ) {
        return res
            .status(400)
            .json({ message: 'Invalid "Content-Range" provided' });
    }

    const busBoy = busboy({ headers: req.headers });

    busBoy.on("error", (e) => {
        console.error("Failed to read file", e);
        res.sendStatus(500);
    });

    busBoy.on("finish", () => {
        res.sendStatus(200);
    });

    busBoy.on("file", (name, file, info) => {
        console.log(`name: ${name}`);
        const { filename, encoding, mimeType } = info;
        const filePath = getFilePath(filename, fileId);

        getFileDetails(filePath)
            .then((stats) => {
                console.log(`stats: ${stats}`);
                if (stats.size !== rangeStart) {
                    return res.status(400).json({ message: "Bad Chunk sent" });
                }
                file.pipe(fs.createWriteStream(filePath, { flags: "a" })).on(
                    "error",
                    (e) => {
                        console.error("failed upload", e);
                        res.sendStatus(500);
                    }
                );
            })
            .catch((err) => {
                console.log("Could not read the file", err);
                return res.status(400).json({
                    message: "No file with provided credentials",
                    credentials: {
                        fileId,
                        filename,
                    },
                });
            });
    });

    req.pipe(busBoy);
});

app.get("/upload-status", (req, res) => {
    if (req.query && req.query.filename && req.query.fileId) {
        getFileDetails(req.query.fileName, req.query.fileId)
            .then((stats) => {
                res.status(200).send({
                    totalChunkUploaded: stats.size,
                });
            })
            .catch((err) => {
                console.error("failed to read file", err);
                res.status(404).send({
                    message: "No file with Provided Credentials",
                    credentials: { ...req.query },
                });
            });
    } else {
        res.status(400).send({
            message: "No file with Provided Credentials",
            credentials: { ...req.query },
        });
    }
});

app.post("/upload-request", (req, res) => {
    if (!req.body || !req.body.filename) {
        return res.status(400).send({ message: "Missing 'filename'" });
    }
    const fileId = uuidv4();
    fs.createWriteStream(getFilePath(req.body.filename, fileId), {
        flags: "w",
    });
    res.status(200).send({ fileId });
});

app.listen(PORT, () => console.log("Server Started!!"));
