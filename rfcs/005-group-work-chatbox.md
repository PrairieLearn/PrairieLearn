# Summary

A chatbox component built with [Socket.io](https://socket.io/) that enabling students to chat with others when doing group-based assignments.

# Core features
1. Public/private channel - Provide public channel to the students who haven't joined a group or students in group but haven't started the assessment yet. After a group assignment is started, only private channel is available.
2. Message reactions - Allow users to add and recall reactions to messages. Currently it only support 7 pre-selected emojis.
3. Message caching - Provide session based front-end caching on messages and message reactions so we can perserve the them when user refresh the page or switch to a different question.

# Implementation
Just like the auto-grader, this chatbox relys on [Socket.io](https://socket.io/) to provide reliable communication.
-   [chatSocket.js](../lib/chatSocket.js): The endpoint for the chatbox. This is the place where we seperate the user to different channel and boardcast the message within the channel. And we initialize it in [server.js](../server.js).
-   [chatbox.ejs](../pages/partials/chatbox.ejs): The frontend of the chatbox. This is where caching and creation of Socket is at. The CSS of the chatbox is seperated and move to [chatbox.css](../public/stylesheets/chatbox.css) and the Javascript is moved to [chatboxScript.ejs](../pages/partials/chatboxScript.ejs).
-   [question.js](../lib/question.js): Two new properties are added to ```locals``` so it can later be used in [question.ejs](../pages/partials/question.ejs) to determine whether to show the chatbox or not in a question page and the channel id.
-   [studentAssessmentHomework.ejs](../pages/studentAssessmentHomework/studentAssessmentHomework.ejs), [studentAssessmentInstanceHomework.ejs](../pages/studentAssessmentInstanceHomework/studentAssessmentInstanceHomework.ejs): These two files are modified to include the chatbox according to whether the assessment is group-based or not.

# Known issues
1.  The server currently keep track of number of online user and total number of messages for all the channel using a dictionary, which can be a problem in long run.
2.  When recovering from cache, chat history won't automatically scroll to the bottom of the history if the last message has reaction.
3.  Not enough server side validation makes it vulnerable to all kinds of web attack. Might need a middleware.