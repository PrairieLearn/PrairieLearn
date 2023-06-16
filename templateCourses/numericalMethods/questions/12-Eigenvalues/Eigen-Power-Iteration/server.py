def generate(data):
    names_for_user = [
        {
            "name": "n",
            "description": "Indicates the number of matrices in As",
            "type": "integer",
        },
        {
            "name": "As",
            "description": "The n matrices you need to process",
            "type": "3D numpy array of shape (n,2,2)",
        },
        {
            "name": "x_0",
            "description": "The initial guess $\mathbf{x}_0$",
            "type": "1D numpy array",
        },
    ]
    names_from_user = [
        {
            "name": "eigenval1",
            "description": "The significant eigenvalues you obtain from As",
            "type": "1D numpy array of shape (n,)",
        },
        {
            "name": "eigenval2",
            "description": "The other eigenvalues you obtain from As",
            "type": "1D numpy array of shape (n,)",
        },
        {
            "name": "eigenvec1",
            "description": "Eigenvectors corresponding to eigenval1",
            "type": "2D numpy array of shape (n,2)",
        },
        {
            "name": "eigenvec2",
            "description": "Eigenvectors corresponding to eigenval2",
            "type": "2D numpy array of shape (n,2)",
        },
        {
            "name": "shifted_eigval",
            "description": "The eigenvalues you obtain from performing Normalized Shifted Inverse Iteration on As",
            "type": "1D numpy array of shape (n,)",
        },
        {
            "name": "shifted_eigvec",
            "description": "Eigenvectors corresponding to shifted_eigval",
            "type": "2D numpy array of shape (n,2)",
        },
        {
            "name": "cnt",
            "description": "stores the number of rounds for normalized power iteration to stop of each matrix",
            "type": "1D numpy array of shape (n,)",
        },
        {
            "name": "ratios",
            "description": "stores the ratios of the eigenvalues",
            "type": "1D numpy array of shape (n,)",
        },
    ]

    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user
    return data
