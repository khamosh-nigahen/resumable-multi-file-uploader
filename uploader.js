const uploadFiles = (() => {
    const fileRequests = new WeakMap();

    const ENDPOINTS = {
        UPLOAD: "http://localhost:3000/upload",
        UPLOAD_STATUS: "http://localhost:3000/upload-status",
        UPLOAD_REQUEST: "http://localhost:3000/upload-request",
    };

    const defaultOptions = {
        url: ENDPOINTS.UPLOAD,
        fileId: null,
        startByte: 0,
        onAbort() {},
        onProgress() {},
        onError() {},
        onComplete() {},
    };

    const uploadFileChunks = (file, options) => {
        console.log(`in upload file chunks`);
        const req = new XMLHttpRequest();
        const formData = new FormData();
        const chunk = file.slice(options.startByte);

        formData.append("chunk", chunk, file.name);
        formData.append("fileId", options.fileId);

        console.log(`formData: ${JSON.stringify(formData)}`);

        console.log(`options.url: ${options.url}`);
        req.open("POST", options.url, true);

        req.setRequestHeader("X-File-Id", options.fileId);
        // req.setRequestHeader("Content-Length", chunk.size);
        req.setRequestHeader(
            "Content-Range",
            `bytes=${options.startByte}-${options.startByte + chunk.size}/${
                file.size
            }`
        );

        console.log(`req.headers: ${req.headers}`);

        req.onload = (e) => options.onComplete(e, file);
        req.onerror = (e) => options.onError(e, file);
        req.ontimeout = (e) => options.onError(e, file);
        req.upload.onprogress = (e) => {
            const loaded = options.startByte + e.loaded;
            options.onProgress({ ...e, loaded, total: file.size }, file);
        };
        req.onabort = (e) => options.onAbort(e, file);

        // fileRequests.set(file, { request: req, options });
        fileRequests.get(file).request = req;

        req.send(formData);
    };

    const uploadFile = (file, options) => {
        console.log(`in upload file`);
        fetch(ENDPOINTS.UPLOAD_REQUEST, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ filename: file.name }),
        })
            .then((res) => {
                return res.text();
            })
            .then((data) => {
                console.log(`data: ${data}`);
                data = JSON.parse(data);
                console.log(`data.fileId: ${data.fileId}`);
                options = { ...options, fileId: data.fileId };
                console.log(`options: ${JSON.stringify(options)}`);
                fileRequests.set(file, { request: null, options });
                uploadFileChunks(file, options);
            })
            .catch((err) => {
                console.log(`Failed to request: ${err}`);
            });
    };

    const abortFileUpload = (file) => {
        const fileReq = fileRequests.get(file);

        if (fileReq) {
            fileReq.request.abort();
        }
    };

    const clearFileUpload = (file) => {
        abortFileUpload(file);
        fileRequests.delete(file);
    };

    const resumeFileUpload = (file) => {
        const fileReq = fileRequests.get(file);

        fetch(
            `${ENDPOINTS.UPLOAD_STATUS}?fileName=${file.name}&fileId=${fileReq.options.fileId}`
        )
            .then((res) => res.text())
            .then((data) => {
                console.log(`-- status: ${data}`);
                uploadFileChunks(file, {
                    ...fileReq.options,
                    startByte: data.totalChunkUploaded,
                });
            });
    };

    return (files, options = defaultOptions) => {
        [...files].forEach((file) => {
            uploadFile(file, (options = { ...defaultOptions, ...options }));
        });

        return {
            abortFileUpload,
            clearFileUpload,
            resumeFileUpload,
        };
    };
})();

const uploadAndTrackFiles = (() => {
    let uploader = {};

    const FILE_STATUS = {
        PENDING: "pending",
        UPLOADING: "uploading",
        PAUSED: "paused",
        COMPLETED: "completed",
        FAILED: "failed",
    };
    const filesMap = new Map();

    const progressBox = document.createElement("div");
    progressBox.className = "upload-progress-tracker";
    progressBox.innerHTML = `
    <h3>Upload</h3>
    <div class="file-progress-wrapper"></div>
    `;

    const fileProgressWrapper = progressBox.querySelector(
        ".file-progress-wrapper"
    );

    const setFileElement = (file) => {
        const fileElement = document.createElement("div");
        fileElement.className = "upload-progress-tracker";
        fileElement.innerHTML = `
        <div class='file-details'>
        <p><span class="file-name">${file.name}</span><span class="file-status">${FILE_STATUS.PENDING}</span></p>
        <div class='progress-bar' style="width: 0; height: 2px; background: green;"></div>
        </div>
        <div class="file-actions">
        <button type="button" class="pause-btn">Pause</button>
        <button type="button" class="resume-btn">Resume</button>
        </div>
        `;
        fileProgressWrapper.appendChild(fileElement);

        filesMap.set(file, {
            status: FILE_STATUS.PENDING,
            size: file.size,
            percentage: 0,
            fileElement,
        });

        const [
            ,
            {
                children: [pauseBtn, resumeBtn],
            },
        ] = fileElement.children;

        pauseBtn.addEventListener("click", () =>
            uploader.abortFileUpload(file)
        );
        resumeBtn.addEventListener("click", () =>
            uploader.resumeFileUpload(file)
        );
    };

    const updateFileElement = (fileObj) => {
        // console.log(fileObj.fileElement.children);
        const [
            {
                children: [
                    {
                        children: [, fileStatus],
                    },
                    progressBox,
                ],
            },
        ] = fileObj.fileElement.children;

        requestAnimationFrame(() => {
            fileStatus.textContent = fileObj.status;
            fileStatus.className = `status ${fileObj.status}`;
            progressBox.style.width = fileObj.percentage + "%";
        });
    };

    const onProgress = (e, file) => {
        console.log("-- progress");
        const fileObj = filesMap.get(file);

        fileObj.status = FILE_STATUS.UPLOADING;
        fileObj.percentage = (e.loaded * 100) / e.total;
        updateFileElement(fileObj);
    };

    const onAbort = (e, file) => {
        console.log("-- abort");
        console.log(e);
        const fileObj = filesMap.get(file);

        fileObj.status = FILE_STATUS.PAUSED;
        fileObj.percentage = 100;
        updateFileElement(fileObj);
    };

    const onComplete = (e, file) => {
        console.log("-- complete");
        const fileObj = filesMap.get(file);

        fileObj.status = FILE_STATUS.COMPLETED;
        fileObj.percentage = 100;
        updateFileElement(fileObj);
    };

    const onError = (e, file) => {
        console.log("-- Error");
        const fileObj = filesMap.get(file);

        fileObj.status = FILE_STATUS.FAILED;
        updateFileElement(fileObj);
    };

    return (uploadedFiles) => {
        [...uploadedFiles].forEach(setFileElement);
        uploader = uploadFiles(uploadedFiles, {
            onAbort,
            onComplete,
            onError,
            onProgress,
        });

        document.body.appendChild(progressBox);
        document.body.appendChild(fileProgressWrapper);
    };
})();

const uploadBtn = document.getElementById("upload-btn");

uploadBtn.addEventListener("change", (e) => {
    // console.log(`-- event logged --`, e.target.files);
    uploadAndTrackFiles(e.target.files);
});
