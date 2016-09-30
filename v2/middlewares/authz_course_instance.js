
        if (req.cookies.userData) {
            var cookieUserData;
            try {
                cookieUserData = JSON.parse(req.cookies.userData);
            } catch (e) {
                return next(error.make(403, "Error parsing cookies.userData as JSON", {userData: req.cookies.userData}));
            }
            if (cookieUserData.authUID) authUID = cookieUserData.authUID;
            if (cookieUserData.authName) authName = cookieUserData.authName;
            if (cookieUserData.authDate) authDate = cookieUserData.authDate;
            if (cookieUserData.authSignature) authSignature = cookieUserData.authSignature;
            if (cookieUserData.mode) mode = cookieUserData.mode;
            if (cookieUserData.userUID) userUID = cookieUserData.userUID;
            if (cookieUserData.userRole) userRole = cookieUserData.userRole;
        }
