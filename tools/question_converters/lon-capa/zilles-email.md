Emailed instructions from zilles [AT] illinois (dot) edu:

You use it by doing the following:

1. unpacking your XML into the LonCapa directory (this should create a 'resources' directory and a file called something like 'imsmanifest.xml'
2. creating a directory called 'questions' in the LonCapa directory
3. running the script using 'python loncapa.py
   imsmanifest.xml'

This will create directories under your newly created 'questions' directory.
I've done a decent effort to try to create an info.json, question.html, and
server.py, as well as copy resource files into a 'clientFilesQuestion'.

What I'd recommend is running the scripts and moving the generated question
directories one at a time to the real 'questions' directory, cleaning them up
and getting them to work before moving on to the next. I think the scripts do
a decent job of saving you time for the examples that you provided, but some
work will still be required on your part. I'm sure the scripts might die on
some problems. I'm happy to keep working with you, but this is about the best
I can do given the examples that you provided.
