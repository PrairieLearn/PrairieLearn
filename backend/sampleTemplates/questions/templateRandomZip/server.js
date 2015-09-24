
define(['underscore', 'PrairieRandom', 'fs', 'module', 'path'], function(_, PrairieRandom, fs, module, path) {

    var server = {};

    server.selectProblem = function(data, rand) {
        // compute the sum of the problem relative frequencies
        var freq_total = _.reduce(data, function(memo, inp) { return memo + inp.freq; }, 0);
    
        // pick one in a weighted random way
        var rindex = rand.randInt(0, freq_total - 1);  
        // console.log(freq_total + " " + rindex);
        for (var i in data) {
            rindex -= data[i].freq;
            if (rindex < 0) { 
                return data[i];
            }
        }	
        // return undefined
    };

    server.getData = function(vid, info) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var config = info.options.config;
        var opath = info.options.path;
        var uploadName = info.options.uploadName;
        var problem = this.selectProblem(config, rand);
	var problemName = problem.problem;

        // The file contents will be put in a data: link for downloading, so we encode it as a URI
        var fileBuffer = fs.readFileSync(path.join(info.questionDir, opath, problemName + ".zip"));
        var fileData = encodeURIComponent(fileBuffer.toString('base64'));

        var params = {
            fileData: fileData,
            fileName: opath + ".zip",
            uploadFileName: uploadName,
        };

        var trueAnswer = {
            problem: problemName
        };

        return {
            params: params,
            trueAnswer: trueAnswer
        };
    };

    server.gradeAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {score: 0};
    };

    return server;
});
