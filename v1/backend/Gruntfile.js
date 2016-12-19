module.exports = function(grunt) {
    
    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        
        jshint: {
            uses_defaults: [
                'server.js',
                '../frontend/require/PrairieDraw.js',
                '../frontend/require/PrairieGeom.js',
                '../frontend/require/PrairieRandom.js',
                '../frontend/require/PrairieTemplate.js',
                '../frontend/require/SimpleExamClient.js',
                '../frontend/require/SimpleClient.js',
                '../frontend/require/SimpleFigure.js',
                'questions/*/*.js'
            ],
            options: {
                jshintrc: "jshintrc"
            }
            //options: {
            //    banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
            //},
            //build: {
            //    src: 'src/<%= pkg.name %>.js',
            //    dest: 'build/<%= pkg.name %>.min.js'
            //}
        }
    });
    
    // Load the plugin that provides the "jshint" task.
    grunt.loadNpmTasks('grunt-contrib-jshint');
    
    // Default task(s).
    grunt.registerTask('default', ['jshint']);
    
};
