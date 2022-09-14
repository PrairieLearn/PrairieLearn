# Summary
Defining the minimum viable product (MVP) for shipping question sharing: the ability for an instructor to use question from another course as part of their assessments. Question sharing is going to be a huge feature with lots of components. The purpose of defining an MVP is so that we can actually ship _something_, while making sure the design is open to adding all the features we want to have eventually in the future. Future features will be released incrementally over time.

# MVP Definition
The user sharing the question will make an edit to the `info.json` to . Then the consuming user will add a reference to that question in their `assessment.json`, allowing them to use the current version of that question in their assessment, and access that question's preview (but not its source) by clicking on it on the page for that assessment. That's it.

# FAQ

## What about 'Shared Courses'?
In the past their was some discussion about having courses specifically designed to be a bunch of shared questions. We feel that this would require too much work, and too much maintenance overhead, for instructors to copy their questions from their actual course to their 'shared course.' Instructors should be able to publish shared questions and/or shared question collections directly from their course to minimize friction.

## What about sharing across PrairieLearn instances?
Because there are many PrairieLearn instances, there needs to be a single source of truth about what collections of questions are named (similar to how npm or pypi are the single source of truth about names of javascript or python packages). Otherwise, there could be naming conflicts. Eventually, we can build a centralized system that governs who owns what collection names, and hosts them so that they can be downloaded by PrairieLearn instances. Instructors can push all their shared questions in their course to a 'collection' in this central repository, then other instructors will be able to import that collection.

With this in our future, we will probably need to have multiple question importing syntaxes: one for importing from the same PrairieLearn instance, and one for importing from a collection published in the central repository. Eventually, we will want to push everyone to importing from the central repository, but we can't lanuch the MVP with that, because it would require us to first build the centralized repository!

## Why not allow shared questions to be source available?
We want to do this, and we will do this, but there are some complicated issues to work out first, such as ownership and code licensing. For example, what if an instructor wants their question to be open source, but licensed under GPL? Then should we enforce that any copy of the question must also be source available under the GPL? If a person copies a GPL question by copy-paste, and then doesn't share it, what are our responsibilities in preventing that? Even if a question is licensed under a more permissive license such as the MIT license, there are still things to consider. For example, can we and should we enforce that the original question authors UID stays in an `authors` field in the `info.json` so that they can continue to receive credit for their work? A quick-fix for these would just be to ask an instructor to waive all rights if sharing a question's source, but that's not an ideal solution.

## Can instructors copy and modify shared questions?
Not for the MVP, but once we get source licensing issues figured out, yes.

## What if the question author edits a question, breaking the consumer's exam?
This is a problem. The MVP won't have any way to address this, because the PL database only ever holds the most recent version of a question, but we will get to this eventually. Having questions versioned in the master repository of questions will help with this.

## Will the shared question show up in the 'Questions' page for the course?
Not for the MVP, but this should be a feature we can add very soon after. We need to make some decisions about which questions exactly should show up in the 'Questions' page. Having _all_ shared questions show up will not be scalable. Most likely, once an instructor imports a collection to their course, thos questions will show up in their questions page.

## What about discoverability?
There will essentially be no way to discover questions at first, the course owner will need to give you the exact QID to use. Eventually the master index of question collections will have a way to search questions and collections. Searching a collection won't show all the question from the collection until the user has permission to use that collection (for exam security purposes), but once you import a collection into your course, you can browse and search them just as you can with your own questions. Even without having a master repository, we could improve discoverability by allowing a course to import all shared questions from another course running on the same server, and then be able to view and search those through the 'Questions' page.

## Will reported errors about questions be propogated to the course where the question originated?
Not now, but eventually this would be nice. However, once we have questions being downloaded in collections from a repository, they are not longer really owned by a course, and so this might not be feasible.